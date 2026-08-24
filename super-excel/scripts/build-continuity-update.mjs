import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildDoneUpdate, buildWaitHitlUpdate, readJson } from "../src/continuity-adapter.mjs";
import { sha256File, writeJson } from "../src/common.mjs";

function args_(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i]?.replace(/^--/, "")] = argv[i + 1];
  return out;
}

const options = args_(process.argv.slice(2));
for (const key of ["mode","job-id","user-id","source","output-json"]) if (!options[key]) throw new Error(`--${key} is required`);
const common = {
  jobId: options["job-id"],
  userId: options["user-id"],
  sourceSha256: await sha256File(path.resolve(options.source)),
};
let update;
if (options.mode === "wait") {
  if (!options.hitl) throw new Error("--hitl is required for wait mode");
  update = buildWaitHitlUpdate({...common, hitl:await readJson(path.resolve(options.hitl))});
} else if (options.mode === "done") {
  for (const key of ["output","output-url","final-report","verification"]) if (!options[key]) throw new Error(`--${key} is required for done mode`);
  update = await buildDoneUpdate({
    ...common,
    outputPath:path.resolve(options.output),
    outputUrl:options["output-url"],
    finalReport:await readJson(path.resolve(options["final-report"])),
    verification:await readJson(path.resolve(options.verification)),
  });
} else {
  throw new Error("--mode must be wait or done");
}
await writeJson(path.resolve(options["output-json"]), update);
await fs.access(path.resolve(options["output-json"]));
console.log(JSON.stringify({mode:options.mode,job_id:update.job_id,status:update.status,output:path.resolve(options["output-json"])},null,2));
