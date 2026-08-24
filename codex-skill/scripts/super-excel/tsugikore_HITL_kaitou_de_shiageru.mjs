import path from "node:path";
import process from "node:process";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { resumeWorkbookA } from "./src/resume-a.mjs";
import { resumeWorkbookB } from "./src/resume-b.mjs";

function readArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${item} の値がありません。`);
    options[item.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function detectKind(inputPath) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const names = workbook.worksheets.items.map((sheet) => sheet.name);
  if (names.includes("🌻証憑照合")) return "A";
  if (names.includes("🌻統合明細")) return "B";
  throw new Error("HITL前処理済みブックではありません。");
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  if (!options.input || !options.decisions) {
    throw new Error("使い方: node tsugikore_HITL_kaitou_de_shiageru.mjs --input <整理済.xlsx> --decisions <回答.json> [--ocr <A.json>] [--outdir <folder>]");
  }
  const inputPath = path.resolve(options.input);
  const decisionsPath = path.resolve(options.decisions);
  const outdir = path.resolve(options.outdir || path.dirname(inputPath));
  const stem = path.basename(inputPath, path.extname(inputPath)).replace(/_🌻整理済$/, "");
  const kind = await detectKind(inputPath);
  const args = {
    inputPath,
    decisionsPath,
    outputPath: path.join(outdir, `${stem}_🌻完成.xlsx`),
    reportPath: path.join(outdir, "最終処理報告.json"),
  };
  if (kind === "A") {
    if (!options.ocr) throw new Error("A形式には --ocr <A.json> が必要です。");
    args.ocrJsonPath = path.resolve(options.ocr);
    await resumeWorkbookA(args);
  } else {
    await resumeWorkbookB(args);
  }
  process.stdout.write(`${JSON.stringify({ kind, outputPath: args.outputPath, reportPath: args.reportPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
