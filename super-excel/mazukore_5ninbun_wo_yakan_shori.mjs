import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { analyzeImages } from "./src/azure-ocr.mjs";
import { callExitApi, morningPayload } from "./src/exit-api-client.mjs";
import { extractEmbeddedImages, findNearbyImages } from "./src/extract-images.mjs";
import { processWorkbookA } from "./src/process-a.mjs";
import { processWorkbookB } from "./src/process-b.mjs";
import { sha256File, writeJson } from "./src/common.mjs";

function readArguments(argv) {
  const options = { deliver: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--deliver") { options.deliver = true; continue; }
    if (!item.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${item} の値がありません。`);
    options[item.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function findXlsxFiles(root) {
  const out = [];
  async function walk(folder) {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx") && !entry.name.startsWith("~$")) out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

async function detectKind(inputPath) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const names = workbook.worksheets.items.map((sheet) => sheet.name);
  if (["8月", "費目", "貼付"].every((name) => names.includes(name))) return "A";
  if (["Aチーム", "B", "EC", "店頭_8月", "まとめ"].every((name) => names.includes(name))) return "B";
  return "UNKNOWN";
}

function safeName(value) {
  return String(value).replace(/[<>:"/\\|?*]/g, "_").slice(0, 100);
}

async function processOne(inputPath, outbox, options) {
  const sha256 = await sha256File(inputPath);
  const jobId = `${safeName(path.basename(inputPath, ".xlsx"))}-${sha256.slice(0, 12)}`;
  const jobDir = path.join(outbox, jobId);
  const originalDir = path.join(jobDir, "original");
  const workDir = path.join(jobDir, "work");
  const resultDir = path.join(jobDir, "result");
  await fs.mkdir(originalDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(resultDir, { recursive: true });
  const preservedPath = path.join(originalDir, path.basename(inputPath));
  await fs.copyFile(inputPath, preservedPath);
  await writeJson(path.join(jobDir, "uketori.json"), {
    job_id: jobId,
    accepted_at: new Date().toISOString(),
    employee_message: "🌻お預かりしました。今日も一日お疲れ様でした！",
    source: { path: inputPath, preserved_path: preservedPath, sha256 },
  });

  const kind = await detectKind(preservedPath);
  if (kind === "UNKNOWN") {
    const state = { job_id: jobId, kind, status: "needs_adapter", reason: "未対応のブック構成" };
    await writeJson(path.join(jobDir, "job_state.json"), state);
    return state;
  }

  const stem = safeName(path.basename(inputPath, path.extname(inputPath)));
  const processorArgs = {
    inputPath: preservedPath,
    outputPath: path.join(resultDir, `${stem}_🌻整理済.xlsx`),
    reportPath: path.join(resultDir, "処理報告.json"),
    hitlPath: path.join(resultDir, "HITL_2問.json"),
  };
  if (kind === "A") {
    const ocrPath = path.join(workDir, "ocr.json");
    if (options["ocr-cache"]) {
      await fs.copyFile(path.resolve(options["ocr-cache"]), ocrPath);
    } else {
      const embedded = await extractEmbeddedImages(preservedPath, path.join(workDir, "embedded-images"));
      const attachments = await findNearbyImages(inputPath);
      const images = [...new Set([...embedded, ...attachments])];
      if (!images.length) throw new Error(`${jobId}: OCR対象画像がありません。`);
      await analyzeImages({
        files: images,
        outputPath: ocrPath,
        endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
        key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
      });
    }
    processorArgs.ocrJsonPath = ocrPath;
    await processWorkbookA(processorArgs);
  } else {
    await processWorkbookB(processorArgs);
  }

  const hitl = JSON.parse(await fs.readFile(processorArgs.hitlPath, "utf8"));
  let delivery = { delivered: false, reason: "--deliver 未指定" };
  if (options.deliver) delivery = await callExitApi(morningPayload(hitl));
  const state = {
    job_id: jobId,
    kind,
    status: options.deliver ? "waiting_hitl" : "ready_for_hitl_delivery",
    source_sha256: sha256,
    output_path: processorArgs.outputPath,
    hitl_path: processorArgs.hitlPath,
    question_count: hitl.questions.length,
    delivery,
  };
  await writeJson(path.join(jobDir, "job_state.json"), state);
  return state;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  if (!options.inbox || !options.outbox) {
    throw new Error("使い方: node mazukore_5ninbun_wo_yakan_shori.mjs --inbox <受取フォルダ> --outbox <結果フォルダ> [--deliver]");
  }
  const inbox = path.resolve(options.inbox);
  const outbox = path.resolve(options.outbox);
  await fs.mkdir(outbox, { recursive: true });
  const files = await findXlsxFiles(inbox);
  const results = [];
  for (const inputPath of files) {
    try {
      results.push(await processOne(inputPath, outbox, options));
    } catch (error) {
      results.push({ input_path: inputPath, status: "failed", error: error.message });
    }
  }
  const report = {
    started_and_finished_at: new Date().toISOString(),
    input_count: files.length,
    success_count: results.filter((result) => !["failed", "needs_adapter"].includes(result.status)).length,
    needs_adapter_count: results.filter((result) => result.status === "needs_adapter").length,
    failed_count: results.filter((result) => result.status === "failed").length,
    results,
  };
  await writeJson(path.join(outbox, "yakan_batch_report.json"), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed_count) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
