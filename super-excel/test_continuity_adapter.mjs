import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDoneStagingUpdate, buildDoneUpdate, buildFailedUpdate, buildWaitHitlUpdate } from "./src/continuity-adapter.mjs";

const questions = [1,2].map((number) => ({
  question_id:`Q${number}`,question:`Question ${number}`,reason:"reason",impact:"one row",
  recommended_option_id:`Q${number}_A`,options:[{option_id:`Q${number}_A`,label:"A"},{option_id:`Q${number}_B`,label:"B"}],
}));
const wait = buildWaitHitlUpdate({jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),hitl:{questions}});
assert.equal(wait.pending_questions.length,2);
assert.equal(wait.pending_questions[0].text,"Question 1");
assert.throws(() => buildWaitHitlUpdate({jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),hitl:{questions:questions.slice(0,1)}}));
assert.throws(() => buildWaitHitlUpdate({jobId:"JOB",userId:"USER",sourceSha256:"not-a-hash",hitl:{questions}}));
assert.throws(() => buildWaitHitlUpdate({jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),hitl:{questions},progress:100}));

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "himawari-continuity-adapter-"));
try {
  const outputPath = path.join(tempRoot, "completed.xlsx");
  const bytes = Buffer.from("deterministic workbook fixture");
  await fs.writeFile(outputPath, bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const done = await buildDoneUpdate({
    jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),outputPath,
    outputUrl:"https://drive.google.com/file/d/OUTPUT",
    finalReport:{output:{sha256},appliedRows:{first:"safe repair"}},
    verification:{sha256,formulaErrorTokens:[],sheets:["Sheet1"],packageStats:{mediaFiles:1}},
  });
  assert.equal(done.status,"DONE");
  assert.equal(done.output.sha256,sha256);
  assert.equal(done.output.file_name,"completed.xlsx");
  assert.equal(done.output.url,"https://drive.google.com/file/d/OUTPUT");
  assert.equal(done.output.qa.formula_errors,0);
  const staging = await buildDoneStagingUpdate({
    jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),outputPath,
    finalReport:{output:{sha256}},verification:{sha256,formulaErrorTokens:[],sheets:["Sheet1"]},
  });
  assert.equal(staging.output.url,undefined);
  assert.equal(staging.output.file_name,"completed.xlsx");
  const failed = buildFailedUpdate({
    jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),errorCode:"NEEDS_ADAPTER",message:"safe stop",
  });
  assert.equal(failed.status,"FAILED");
  assert.equal(failed.error.safe_stop,true);
  await assert.rejects(() => buildDoneUpdate({
    jobId:"JOB",userId:"USER",sourceSha256:"a".repeat(64),outputPath,
    outputUrl:"https://example.com/not-drive",
    finalReport:{output:{sha256}},verification:{sha256,formulaErrorTokens:[]},
  }));
} finally {
  await fs.rm(tempRoot,{recursive:true,force:true});
}
console.log("14 Continuity adapter assertion groups passed");
