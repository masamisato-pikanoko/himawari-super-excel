import fs from "node:fs/promises";
import { sha256File } from "./common.mjs";

export const CONTINUITY_WORKER_UPDATE_VERSION = "himawari.worker-update.v1";

function assertIdentity({jobId, userId, sourceSha256}) {
  if (!String(jobId || "").trim()) throw new Error("jobId is required");
  if (!String(userId || "").trim()) throw new Error("userId is required");
  if (!/^[a-f0-9]{64}$/i.test(String(sourceSha256 || ""))) throw new Error("sourceSha256 must be a SHA-256 hex digest");
}

function assertQuestions(questions) {
  if (!Array.isArray(questions) || questions.length !== 2) throw new Error("Continuity Core requires exactly two HITL questions");
  const ids = new Set();
  for (const question of questions) {
    if (!question?.question_id || ids.has(question.question_id)) throw new Error("HITL question IDs must be present and unique");
    ids.add(question.question_id);
    if (!question.question || !question.reason || !question.impact) throw new Error(`HITL question contract is incomplete: ${question.question_id}`);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 3) throw new Error(`HITL options must contain 2 or 3 choices: ${question.question_id}`);
    const optionIds = new Set(question.options.map((option) => option?.option_id));
    if (optionIds.has(undefined) || optionIds.size !== question.options.length || !question.options.every((option) => option?.label)) throw new Error(`HITL options must have unique IDs and labels: ${question.question_id}`);
    if (!optionIds.has(question.recommended_option_id)) throw new Error(`HITL recommendation must match an option: ${question.question_id}`);
  }
}

export function buildWaitHitlUpdate({jobId, userId, sourceSha256, hitl, updateVersion = 1, progress = 82}) {
  assertIdentity({jobId, userId, sourceSha256});
  assertQuestions(hitl?.questions);
  if (!Number.isInteger(updateVersion) || updateVersion < 1) throw new Error("updateVersion must be a positive integer");
  if (!Number.isFinite(progress) || progress < 0 || progress > 99) throw new Error("WAIT_HITL progress must be between 0 and 99");
  return {
    contract_version: CONTINUITY_WORKER_UPDATE_VERSION,
    update_version: updateVersion,
    job_id: jobId,
    user_id: userId,
    source_sha256: sourceSha256,
    status: "WAIT_HITL",
    progress,
    pending_questions: hitl.questions.map((question) => ({
      question_id: question.question_id,
      text: question.question,
      reason: question.reason,
      impact: question.impact,
      options: question.options,
      recommended_option_id: question.recommended_option_id,
    })),
  };
}

export async function buildDoneUpdate({jobId, userId, sourceSha256, outputPath, outputUrl, finalReport, verification, updateVersion = 2}) {
  const update = await buildDoneStagingUpdate({
    jobId, userId, sourceSha256, outputPath, finalReport, verification, updateVersion,
  });
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(String(outputUrl || ""))) throw new Error("A Google Drive output URL is required");
  update.output.url = outputUrl;
  return update;
}

export async function buildDoneStagingUpdate({jobId, userId, sourceSha256, outputPath, finalReport, verification, updateVersion = 2}) {
  assertIdentity({jobId, userId, sourceSha256});
  if (!Number.isInteger(updateVersion) || updateVersion < 1) throw new Error("updateVersion must be a positive integer");
  const outputSha256 = await sha256File(outputPath);
  if (finalReport?.output?.sha256 !== outputSha256) throw new Error("Final report output SHA-256 does not match the workbook");
  if (verification?.sha256 !== outputSha256) throw new Error("Verification SHA-256 does not match the workbook");
  if (!Array.isArray(verification?.formulaErrorTokens) || verification.formulaErrorTokens.length) throw new Error("Formula error scan did not pass");
  return {
    contract_version: CONTINUITY_WORKER_UPDATE_VERSION,
    update_version: updateVersion,
    job_id: jobId,
    user_id: userId,
    source_sha256: sourceSha256,
    status: "DONE",
    progress: 100,
    pending_questions: [],
    output: {
      file_name: String(outputPath).split(/[\\/]/).pop(),
      sha256: outputSha256,
      summary: Object.values(finalReport.appliedRows || {}).join(" / ") || "2問の回答を反映した改訂版",
      qa: {
        passed: true,
        formula_errors: verification.formulaErrorTokens.length,
        sheet_count: verification.sheets?.length || 0,
        package_stats: verification.packageStats || {},
        original_sha256: sourceSha256,
      },
    },
  };
}

export function buildFailedUpdate({jobId, userId, sourceSha256, errorCode, message, updateVersion = 1}) {
  assertIdentity({jobId, userId, sourceSha256});
  if (!Number.isInteger(updateVersion) || updateVersion < 1) throw new Error("updateVersion must be a positive integer");
  const safeCode = String(errorCode || "WORKER_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120);
  const safeMessage = String(message || "Worker stopped safely").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
  return {
    contract_version: CONTINUITY_WORKER_UPDATE_VERSION,
    update_version: updateVersion,
    job_id: jobId,
    user_id: userId,
    source_sha256: sourceSha256,
    status: "FAILED",
    progress: 0,
    pending_questions: [],
    error: {code: safeCode, message: safeMessage, safe_stop: true},
  };
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
