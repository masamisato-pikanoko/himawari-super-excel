import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import JSZip from "jszip";
import { sha256File, writeJson } from "../src/common.mjs";

const [inputPathArg, renderDirArg, reportPathArg] = process.argv.slice(2);
if (!inputPathArg || !renderDirArg || !reportPathArg) {
  throw new Error("Usage: node verify-output.mjs <input.xlsx> <render-dir> <report.json>");
}

const inputPath = path.resolve(inputPathArg);
const renderDir = path.resolve(renderDirArg);
const reportPath = path.resolve(reportPathArg);
await fs.mkdir(renderDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});

const sheetReports = [];
for (let index = 0; index < workbook.worksheets.items.length; index += 1) {
  const sheet = workbook.worksheets.items[index];
  const used = sheet.getUsedRange();
  const usedRange = used?.address ?? null;
  const safeName = sheet.name.replace(/[<>:"/\\|?*]/g, "_");
  const renderPath = path.join(renderDir, `${String(index + 1).padStart(2, "0")}_${safeName}.png`);
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(renderPath, new Uint8Array(await preview.arrayBuffer()));
  const formulaInspect = usedRange
    ? await workbook.inspect({
        kind: "formula",
        sheetId: sheet.name,
        range: usedRange,
        maxChars: 15000,
        options: { maxResults: 500 },
      })
    : null;
  sheetReports.push({
    name: sheet.name,
    usedRange,
    renderPath,
    renderBytes: (await fs.stat(renderPath)).size,
    formulaInspect: formulaInspect?.ndjson ?? formulaInspect ?? null,
  });
}

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const entries = Object.keys(zip.files);
const packageStats = {
  mediaFiles: entries.filter((name) => /^xl\/media\//i.test(name) && !name.endsWith("/")).length,
  drawingFiles: entries.filter((name) => /^xl\/drawings\/drawing\d+\.xml$/i.test(name)).length,
  chartFiles: entries.filter((name) => /^xl\/charts\/chart\d+\.xml$/i.test(name)).length,
  externalLinkFiles: entries.filter((name) => /^xl\/externalLinks\//i.test(name) && !name.endsWith("/")).length,
  macroFiles: entries.filter((name) => /vbaProject\.bin$/i.test(name)).length,
};

const errorText = errorScan?.ndjson ?? String(errorScan ?? "");
const report = {
  inputPath,
  sha256: await sha256File(inputPath),
  sheets: sheetReports,
  packageStats,
  formulaErrorScan: errorText,
  formulaErrorTokens: ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"].filter((token) => errorText.includes(token)),
};
await writeJson(reportPath, report);
console.log(JSON.stringify({
  inputPath,
  sheetCount: sheetReports.length,
  sheets: sheetReports.map(({ name, usedRange, renderBytes }) => ({ name, usedRange, renderBytes })),
  packageStats,
  formulaErrorTokens: report.formulaErrorTokens,
  reportPath,
}, null, 2));
