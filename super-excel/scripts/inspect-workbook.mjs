import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  throw new Error("Usage: node inspect-workbook.mjs <input.xlsx>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const readInspect = async (request) => {
  const result = await workbook.inspect(request);
  return result?.ndjson ?? result;
};

const overview = await readInspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 12000,
  tableMaxRows: 4,
  tableMaxCols: 12,
  tableMaxCellChars: 100,
});

const sheets = [];
for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  const address = used?.address ?? null;
  const region = address
    ? await readInspect({
        kind: "region",
        sheetId: sheet.name,
        range: address,
        maxChars: 9000,
        tableMaxRows: 12,
        tableMaxCols: 18,
        tableMaxCellChars: 120,
      })
    : null;
  const formulas = address
    ? await readInspect({
        kind: "formula",
        sheetId: sheet.name,
        range: address,
        maxChars: 6000,
        options: { maxResults: 120 },
      })
    : null;
  const styles = address
    ? await readInspect({
        kind: "computedStyle",
        sheetId: sheet.name,
        range: address,
        maxChars: 4500,
      })
    : null;
  sheets.push({ name: sheet.name, usedRange: address, region, formulas, styles });
}

console.log(JSON.stringify({ inputPath, overview, sheets }, null, 2));
