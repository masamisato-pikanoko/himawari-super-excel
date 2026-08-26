import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {FileBlob, SpreadsheetFile} from "@oai/artifact-tool";
import {analyzeImages} from "../src/azure-ocr.mjs";
import {buildDoneStagingUpdate, buildFailedUpdate, buildWaitHitlUpdate} from "../src/continuity-adapter.mjs";
import {sha256File} from "../src/common.mjs";
import {extractEmbeddedImages, findNearbyImages} from "../src/extract-images.mjs";
import {processWorkbookA} from "../src/process-a.mjs";
import {processWorkbookB} from "../src/process-b.mjs";
import {resumeWorkbookA} from "../src/resume-a.mjs";
import {resumeWorkbookB} from "../src/resume-b.mjs";

const WORKER_ENVELOPE_VERSION = "himawari.worker-envelope.v1";
const WORKER_RESUME_VERSION = "himawari.worker-resume.v1";
const JOB_PREFIX = "XLSX_";
const LOCK_MAX_AGE_MS = 30 * 60 * 1000;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(scriptDir, "..");

class SafeWorkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SafeWorkerError";
    this.code = code;
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const name = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${item} の値がありません。`);
    options[name] = value;
    index += 1;
  }
  return options;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonOnce(filePath, value) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  try {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

async function appendWorkerLog(runtimeDir, entry) {
  await fs.mkdir(runtimeDir, {recursive: true});
  const safe = {
    timestamp: new Date().toISOString(),
    level: entry.level || "INFO",
    job_id: entry.job_id || "",
    event: entry.event || "",
    message: String(entry.message || "").slice(0, 1000),
  };
  await fs.appendFile(path.join(runtimeDir, "worker.jsonl"), `${JSON.stringify(safe)}\n`, "utf8");
}

async function acquireLock(runtimeDir) {
  await fs.mkdir(runtimeDir, {recursive: true});
  const lockPath = path.join(runtimeDir, "worker.lock");
  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({pid: process.pid, created_at: new Date().toISOString()})}\n`);
    return {handle, lockPath};
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= LOCK_MAX_AGE_MS) return null;
    await fs.unlink(lockPath);
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({pid: process.pid, created_at: new Date().toISOString(), stale_lock_replaced: true})}\n`);
    return {handle, lockPath};
  }
}

async function releaseLock(lock) {
  if (!lock) return;
  await lock.handle.close();
  await fs.unlink(lock.lockPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: engineRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-20000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-20000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new SafeWorkerError("QA_TOOL_FAILED", (stderr || stdout || `QA tool exited ${code}`).slice(0, 1000)));
    });
  });
}

async function verifyWorkbook(inputPath, renderDir, reportPath, contactPath) {
  await runNodeScript(path.join(engineRoot, "scripts", "verify-output.mjs"), [inputPath, renderDir, reportPath]);
  const report = await readJson(reportPath);
  if (!Array.isArray(report.formulaErrorTokens) || report.formulaErrorTokens.length) {
    throw new SafeWorkerError("FORMULA_QA_FAILED", `数式エラーを検出しました: ${(report.formulaErrorTokens || []).join(", ")}`);
  }
  await runNodeScript(path.join(engineRoot, "scripts", "make-contact-sheet.mjs"), [renderDir, contactPath]);
  return report;
}

async function detectKind(inputPath) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const names = workbook.worksheets.items.map((sheet) => sheet.name);
  if (["8月", "費目", "貼付"].every((name) => names.includes(name))) return "A";
  if (["Aチーム", "B", "EC", "店頭_8月", "まとめ"].every((name) => names.includes(name))) return "B";
  throw new SafeWorkerError("NEEDS_ADAPTER", `未対応のブック構成です: ${names.slice(0, 20).join(", ")}`);
}

function safeStem(value) {
  return String(value).replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*]/g, "_").slice(0, 100);
}

function validateEnvelope(envelope, jobId) {
  if (envelope?.contract_version !== WORKER_ENVELOPE_VERSION) throw new SafeWorkerError("INVALID_ENVELOPE", "Worker封筒の契約版が一致しません。");
  if (envelope.job_id !== jobId) throw new SafeWorkerError("INVALID_ENVELOPE", "Worker封筒のJOB_IDがフォルダ名と一致しません。");
  if (!envelope.user_id || !/^[a-f0-9]{64}$/i.test(String(envelope.source?.sha256 || ""))) {
    throw new SafeWorkerError("INVALID_ENVELOPE", "Worker封筒のユーザーまたは原本SHA-256が不正です。");
  }
}

async function processPreliminary({jobDir, artifactsDir, envelope, sourcePath, statePath}) {
  const preliminaryDir = path.join(jobDir, "preliminary");
  const workDir = path.join(jobDir, "work");
  const rendersDir = path.join(preliminaryDir, "renders");
  await fs.mkdir(preliminaryDir, {recursive: true});
  await fs.mkdir(workDir, {recursive: true});
  await writeJson(statePath, {job_id: envelope.job_id, status: "PROCESSING_PRELIMINARY", updated_at: new Date().toISOString()});

  const kind = await detectKind(sourcePath);
  const stem = safeStem(envelope.source.name);
  const outputPath = path.join(preliminaryDir, `${stem}_🌻整理済.xlsx`);
  const reportPath = path.join(artifactsDir, "処理報告.json");
  const hitlPath = path.join(artifactsDir, "HITL_2問.json");
  const qaPath = path.join(artifactsDir, "検品報告.wait.json");
  const contactPath = path.join(preliminaryDir, "contact-wait.png");
  let ocrPath = "";

  if (kind === "A") {
    ocrPath = path.join(workDir, "ocr.json");
    if (!await exists(ocrPath)) {
      if (!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || !process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
        throw new SafeWorkerError("OCR_NOT_CONFIGURED", "A形式の画像OCRに必要なAzure Document Intelligence設定がありません。");
      }
      const embedded = await extractEmbeddedImages(sourcePath, path.join(workDir, "embedded-images"));
      const attachments = await findNearbyImages(sourcePath);
      const images = [...new Set([...embedded, ...attachments])];
      if (!images.length) throw new SafeWorkerError("OCR_IMAGES_NOT_FOUND", "A形式ですがOCR対象画像がありません。");
      await analyzeImages({
        files: images,
        outputPath: ocrPath,
        endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
        key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
      });
    }
    await processWorkbookA({inputPath: sourcePath, ocrJsonPath: ocrPath, outputPath, reportPath, hitlPath});
  } else {
    await processWorkbookB({inputPath: sourcePath, outputPath, reportPath, hitlPath});
  }

  const verification = await verifyWorkbook(outputPath, rendersDir, qaPath, contactPath);
  const hitl = await readJson(hitlPath);
  const update = buildWaitHitlUpdate({
    jobId: envelope.job_id,
    userId: envelope.user_id,
    sourceSha256: envelope.source.sha256,
    hitl,
  });
  update.artifacts = {
    preliminary_file_name: path.basename(outputPath),
    report_file_name: path.basename(reportPath),
    qa_file_name: path.basename(qaPath),
    contact_sheet_file_name: path.basename(contactPath),
  };
  await writeJsonOnce(path.join(artifactsDir, "worker-update.wait.v1.json"), update);
  const state = {
    job_id: envelope.job_id,
    status: "WAIT_HITL",
    kind,
    source_sha256: envelope.source.sha256,
    preliminary_file: path.relative(jobDir, outputPath),
    ocr_file: ocrPath ? path.relative(jobDir, ocrPath) : "",
    sheet_count: verification.sheets.length,
    updated_at: new Date().toISOString(),
  };
  await writeJson(statePath, state);
  return {...state, changed: true};
}

function validateResume(resume, envelope) {
  if (resume?.contract_version !== WORKER_RESUME_VERSION) throw new SafeWorkerError("INVALID_RESUME", "再開契約版が一致しません。");
  if (resume.job_id !== envelope.job_id || resume.user_id !== envelope.user_id || resume.source_sha256 !== envelope.source.sha256) {
    throw new SafeWorkerError("INVALID_RESUME", "再開要求が同じJOB・ユーザー・原本ではありません。");
  }
  if (!Array.isArray(resume.answers) || resume.answers.length !== 2) throw new SafeWorkerError("INVALID_RESUME", "再開には2問すべての回答が必要です。");
  const ids = new Set(resume.answers.map((answer) => answer.question_id));
  if (ids.size !== 2 || resume.answers.some((answer) => !answer.option_id)) throw new SafeWorkerError("INVALID_RESUME", "回答IDまたは選択肢IDが不正です。");
}

async function findOnlyXlsx(folder) {
  const entries = await fs.readdir(folder, {withFileTypes: true});
  const files = entries.filter((entry) => entry.isFile() && /\.xlsx$/i.test(entry.name) && !entry.name.startsWith("~$")).map((entry) => path.join(folder, entry.name));
  if (files.length !== 1) throw new SafeWorkerError("PRELIMINARY_NOT_UNIQUE", `整理済みExcelが1件ではありません: ${files.length}`);
  return files[0];
}

async function processResume({jobDir, artifactsDir, envelope, sourcePath, statePath, resumePath}) {
  const resume = await readJson(resumePath);
  validateResume(resume, envelope);
  const state = await exists(statePath) ? await readJson(statePath) : {};
  const preliminaryPath = state.preliminary_file
    ? path.join(jobDir, state.preliminary_file)
    : await findOnlyXlsx(path.join(jobDir, "preliminary"));
  if (!await exists(preliminaryPath)) throw new SafeWorkerError("PRELIMINARY_NOT_FOUND", "再開対象の整理済みExcelがありません。");

  const finalDir = path.join(jobDir, "final");
  const rendersDir = path.join(finalDir, "renders");
  await fs.mkdir(finalDir, {recursive: true});
  await writeJson(statePath, {...state, status: "PROCESSING_RESUME", updated_at: new Date().toISOString()});
  const stem = safeStem(envelope.source.name);
  const outputPath = path.join(finalDir, `${stem}_🌻完成.xlsx`);
  const reportPath = path.join(artifactsDir, "最終処理報告.json");
  const qaPath = path.join(artifactsDir, "検品報告.done.json");
  const contactPath = path.join(finalDir, "contact-final.png");
  const kind = state.kind || await detectKind(sourcePath);

  if (kind === "A") {
    const ocrPath = state.ocr_file ? path.join(jobDir, state.ocr_file) : path.join(jobDir, "work", "ocr.json");
    if (!await exists(ocrPath)) throw new SafeWorkerError("OCR_RESULT_NOT_FOUND", "A形式の再開に必要なOCR結果がありません。");
    await resumeWorkbookA({inputPath: preliminaryPath, ocrJsonPath: ocrPath, decisionsPath: resumePath, outputPath, reportPath});
  } else if (kind === "B") {
    await resumeWorkbookB({inputPath: preliminaryPath, decisionsPath: resumePath, outputPath, reportPath});
  } else {
    throw new SafeWorkerError("NEEDS_ADAPTER", "再開対象の形式を判定できません。");
  }

  const verification = await verifyWorkbook(outputPath, rendersDir, qaPath, contactPath);
  const finalReport = await readJson(reportPath);
  const update = await buildDoneStagingUpdate({
    jobId: envelope.job_id,
    userId: envelope.user_id,
    sourceSha256: envelope.source.sha256,
    outputPath,
    finalReport,
    verification,
  });
  update.output.relative_path = path.relative(jobDir, outputPath).replaceAll("\\", "/");
  update.artifacts = {
    report_file_name: path.basename(reportPath),
    qa_file_name: path.basename(qaPath),
    contact_sheet_file_name: path.basename(contactPath),
  };
  await writeJsonOnce(path.join(artifactsDir, "worker-update.done.v2.json"), update);
  const completedState = {
    ...state,
    status: "DONE",
    final_file: path.relative(jobDir, outputPath),
    final_sha256: update.output.sha256,
    sheet_count: verification.sheets.length,
    updated_at: new Date().toISOString(),
  };
  await writeJson(statePath, completedState);
  return {...completedState, changed: true};
}

async function processJob(jobDir, runtimeDir) {
  const jobId = path.basename(jobDir);
  const artifactsDir = path.join(jobDir, "artifacts");
  const envelopePath = path.join(artifactsDir, "worker-envelope.v1.json");
  const waitPath = path.join(artifactsDir, "worker-update.wait.v1.json");
  const resumePath = path.join(artifactsDir, "worker-resume.v1.json");
  const donePath = path.join(artifactsDir, "worker-update.done.v2.json");
  const failedPath = path.join(artifactsDir, "worker-update.failed.v1.json");
  const statePath = path.join(artifactsDir, "worker-local-state.v1.json");
  if (!await exists(envelopePath)) return {job_id: jobId, status: "SKIPPED", reason: "ENVELOPE_NOT_READY"};
  if (await exists(donePath)) return {job_id: jobId, status: "SKIPPED", reason: "ALREADY_DONE"};
  if (await exists(failedPath)) return {job_id: jobId, status: "SKIPPED", reason: "SAFE_STOP_RECORDED"};

  let envelope;
  try {
    envelope = await readJson(envelopePath);
    validateEnvelope(envelope, jobId);
    const sourcePath = path.join(jobDir, "original", envelope.source.name);
    if (!await exists(sourcePath)) throw new SafeWorkerError("ORIGINAL_NOT_READY", "Drive同期中、または原本保全コピーがまだ見つかりません。");
    const sourceSha256 = await sha256File(sourcePath);
    if (sourceSha256 !== envelope.source.sha256) throw new SafeWorkerError("ORIGINAL_HASH_MISMATCH", "原本保全コピーのSHA-256がWorker封筒と一致しません。");

    let result;
    if (!await exists(waitPath)) {
      result = await processPreliminary({jobDir, artifactsDir, envelope, sourcePath, statePath});
      await appendWorkerLog(runtimeDir, {job_id: jobId, event: "WAIT_HITL_READY", message: "2問のWorker結果を作成しました。"});
    } else if (await exists(resumePath)) {
      result = await processResume({jobDir, artifactsDir, envelope, sourcePath, statePath, resumePath});
      await appendWorkerLog(runtimeDir, {job_id: jobId, event: "DONE_READY", message: "完成Worker結果を作成しました。"});
    } else {
      result = {job_id: jobId, status: "WAIT_HITL"};
    }
    return result;
  } catch (error) {
    const code = error.code || "WORKER_FAILED";
    const message = String(error.message || "Worker stopped safely").slice(0, 1000);
    if (code === "ORIGINAL_NOT_READY") {
      await appendWorkerLog(runtimeDir, {level: "WARN", job_id: jobId, event: code, message});
      return {job_id: jobId, status: "SKIPPED", reason: code};
    }
    if (envelope?.job_id && envelope?.user_id && envelope?.source?.sha256) {
      const failed = buildFailedUpdate({
        jobId: envelope.job_id,
        userId: envelope.user_id,
        sourceSha256: envelope.source.sha256,
        errorCode: code,
        message,
      });
      await writeJsonOnce(failedPath, failed);
      await writeJson(statePath, {job_id: jobId, status: "FAILED", error: failed.error, updated_at: new Date().toISOString()});
    }
    await appendWorkerLog(runtimeDir, {level: "ERROR", job_id: jobId, event: code, message});
    return {job_id: jobId, status: "FAILED", error_code: code, message};
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.root) throw new Error("使い方: node himawari-drive-worker.mjs --root <🌻ひまわりシステム_DEVフォルダ>");
  const root = path.resolve(options.root);
  const jobsDir = path.join(root, "JOBS");
  const runtimeDir = path.join(root, "worker-runtime");
  if (!await exists(jobsDir)) throw new Error(`JOBSフォルダがありません: ${jobsDir}`);
  const controlPath = path.join(runtimeDir, "pilot-control.json");
  if (!await exists(controlPath)) {
    process.stdout.write(`${JSON.stringify({ok: true, skipped: true, reason: "PILOT_CONTROL_NOT_READY"})}\n`);
    return;
  }
  const control = await readJson(controlPath);
  if (control.enabled !== true) {
    process.stdout.write(`${JSON.stringify({ok: true, skipped: true, reason: "PILOT_STOPPED"})}\n`);
    return;
  }
  const lock = await acquireLock(runtimeDir);
  if (!lock) {
    process.stdout.write(`${JSON.stringify({ok: true, skipped: true, reason: "WORKER_ALREADY_RUNNING"})}\n`);
    return;
  }
  try {
    const entries = await fs.readdir(jobsDir, {withFileTypes: true});
    const jobs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(JOB_PREFIX)).map((entry) => path.join(jobsDir, entry.name)).sort();
    const results = [];
    for (const jobDir of jobs) results.push(await processJob(jobDir, runtimeDir));
    const report = {
      ok: results.every((item) => item.status !== "FAILED"),
      checked_at: new Date().toISOString(),
      job_count: jobs.length,
      processed_count: results.filter((item) => item.changed === true).length,
      results,
    };
    await writeJson(path.join(runtimeDir, "last-run.json"), report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await releaseLock(lock);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
