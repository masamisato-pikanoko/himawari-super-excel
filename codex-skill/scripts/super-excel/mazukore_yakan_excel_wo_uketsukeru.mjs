import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { processWorkbookA } from "./src/process-a.mjs";
import { processWorkbookB } from "./src/process-b.mjs";

function readArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const name = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${name} の値がありません。`);
    options[name] = value;
    index += 1;
  }
  return options;
}

async function detectWorkbookKind(inputPath) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const names = workbook.worksheets.items.map((sheet) => sheet.name);
  if (["8月", "費目", "貼付"].every((name) => names.includes(name))) return "A";
  if (["Aチーム", "B", "EC", "店頭_8月", "まとめ"].every((name) => names.includes(name))) return "B";
  throw new Error(`未対応のブック構成です: ${names.join(", ")}`);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  if (!options.input) {
    throw new Error("使い方: node mazukore_yakan_excel_wo_uketsukeru.mjs --input <xlsx> [--ocr <A.json>] [--outdir <folder>]");
  }
  const inputPath = path.resolve(options.input);
  const outdir = path.resolve(options.outdir || path.join(process.cwd(), "results"));
  const kind = await detectWorkbookKind(inputPath);
  const stem = path.basename(inputPath, path.extname(inputPath));
  const safeStem = stem.replace(/[<>:"/\\|?*]/g, "_");
  const resultDir = path.join(outdir, `${kind}-${safeStem}`);
  await fs.mkdir(resultDir, { recursive: true });
  const args = {
    inputPath,
    outputPath: path.join(resultDir, `${safeStem}_🌻整理済.xlsx`),
    reportPath: path.join(resultDir, "処理報告.json"),
    hitlPath: path.join(resultDir, "HITL_2問.json"),
  };
  if (kind === "A") {
    if (!options.ocr) throw new Error("A形式には --ocr <A.json> が必要です。");
    args.ocrJsonPath = path.resolve(options.ocr);
    await processWorkbookA(args);
  } else {
    await processWorkbookB(args);
  }
  process.stdout.write(`${JSON.stringify({ kind, resultDir, outputPath: args.outputPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
