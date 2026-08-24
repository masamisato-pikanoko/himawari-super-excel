import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./src/common.mjs";

const base = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const readJson = async (...parts) => JSON.parse(await fs.readFile(path.join(base, ...parts), "utf8"));

assert.equal(await sha256File(path.join(base, "inputs", "A", "original", "共有_0823.xlsx")), "4e78506bb3f205676072e74c7af1b6cb68308684ff3bc8dee52d2cdfdf6e9742");
assert.equal(await sha256File(path.join(base, "inputs", "B", "original", "最終版_3.xlsx")), "0a4a469527af72f3b1a57ed1ed983cca76b7eea1f03ae57554ef3083a36e8291");

const hitlA = await readJson("results", "A-共有_0823", "HITL_2問.json");
const hitlB = await readJson("results", "B-最終版_3", "HITL_2問.json");
assert.equal(hitlA.questions.length, 2);
assert.equal(hitlB.questions.length, 2);
assert.deepEqual(hitlA.questions.map((question) => question.question_id), ["receipt_precedence", "duplicate_images"]);
assert.deepEqual(hitlB.questions.map((question) => question.question_id), ["duplicate_orders", "ec_status"]);
assert.equal(hitlA.questions[0].recommended_option_id, "receipt");
assert.equal(hitlB.questions[0].recommended_option_id, "keep_separate");

for (const parts of [
  ["results", "A-共有_0823", "検品報告.json"],
  ["results", "B-最終版_3", "検品報告.json"],
  ["results", "A-共有_0823", "synthetic-resume", "検品報告.json"],
  ["results", "B-最終版_3", "synthetic-resume", "検品報告.json"],
  ["test-runs", "A-keep", "検品報告.json"],
  ["test-runs", "B-merge-confirmed", "検品報告.json"],
]) {
  const report = await readJson(...parts);
  assert.deepEqual(report.formulaErrorTokens, [], `${parts.join("/")} contains formula errors`);
}

const verifyA = await readJson("results", "A-共有_0823", "検品報告.json");
const verifyB = await readJson("results", "B-最終版_3", "検品報告.json");
assert.equal(verifyA.packageStats.mediaFiles, 12);
assert.equal(verifyA.packageStats.drawingFiles, 1);
assert.equal(verifyB.packageStats.drawingFiles, 1);
assert.equal(verifyA.packageStats.externalLinkFiles + verifyB.packageStats.externalLinkFiles, 0);
assert.equal(verifyA.packageStats.macroFiles + verifyB.packageStats.macroFiles, 0);

const batch = await readJson("batch-fixture", "outbox", "yakan_batch_report.json");
assert.equal(batch.input_count, 2);
assert.equal(batch.success_count, 2);
assert.equal(batch.failed_count, 0);
assert.ok(batch.results.every((result) => result.question_count === 2));

console.log("14 SuperExcel assertion groups passed");
