import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  PALETTES,
  addFinalAnswerSheet,
  mapHeaderColumns,
  normalizeDecisions,
  parseFlexibleDate,
  parseMoney,
  sha256File,
  writeJson,
} from "./common.mjs";
import { loadReceiptAnalysis } from "./receipt-analysis.mjs";

const ALIASES = {
  number: ["No.", "No", "番号"],
  usedDate: ["利用日"],
  net: ["税抜", "税抜金額"],
  tax: ["消費税", "税額"],
  total: ["合計", "税込"],
  evidence: ["証憑", "領収番号"],
  check: ["確認", "チェック"],
};

function addReceiptDecisionSheet(workbook, receipts, mode) {
  const sheet = workbook.worksheets.add("🌻証憑採用方針");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.getRange("A1:G1").merge();
  sheet.getRange("A1").values = [["🌻 証憑画像の採用方針"]];
  sheet.getRange("A1:G1").format = {
    fill: "#0F766E", font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:G2").merge();
  sheet.getRange("A2").values = [["証拠保全のため画像ファイル自体は削除せず、論理的な1証憑グループとして整理します。"]];
  sheet.getRange("A2:G2").format = { fill: "#CCFBF1", font: { color: "#115E59" }, wrapText: true };
  sheet.getRange("A4:G4").values = [["画像", "グループキー", "証憑ID", "日付", "金額", "扱い", "関連画像"]];
  const representatives = new Map();
  const rows = receipts.map((receipt) => {
    const key = receipt.receiptId || (receipt.auth ? `AUTH-${receipt.auth}` : `${receipt.date}-${receipt.totalYen ?? "?"}`);
    if (!representatives.has(key)) representatives.set(key, receipt.file);
    const representative = representatives.get(key);
    let disposition = "回答保留";
    if (mode === "group") disposition = receipt.file === representative ? "代表画像" : `同一証憑（代表: ${representative}）`;
    if (mode === "keep") disposition = "別画像として保持";
    return [
      receipt.file,
      key,
      receipt.receiptId || (receipt.auth ? `AUTH ${receipt.auth}` : "ID不明"),
      receipt.date,
      receipt.totalYen,
      disposition,
      receipt.duplicateCandidates.map((candidate) => candidate.file).join(", "),
    ];
  });
  if (rows.length) sheet.getRangeByIndexes(4, 0, rows.length, 7).values = rows;
  const end = Math.max(5, 4 + rows.length);
  sheet.getRange("A4:G4").format = {
    fill: "#0F766E", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center",
  };
  sheet.getRange(`A5:G${end}`).format = {
    wrapText: true, verticalAlignment: "top",
    borders: { insideHorizontal: { style: "thin", color: "#D1FAE5" } },
  };
  sheet.getRange(`E5:E${end}`).format.numberFormat = '#,##0"円"';
  [20, 20, 14, 13, 14, 30, 36].forEach((width, index) => {
    sheet.getRange(`${String.fromCharCode(65 + index)}:${String.fromCharCode(65 + index)}`).format.columnWidth = width;
  });
  sheet.getRange(`A1:G${end}`).format.autofitRows();
  return { rowCount: rows.length, groupCount: representatives.size };
}

export async function resumeWorkbookA({ inputPath, ocrJsonPath, decisionsPath, outputPath, reportPath }) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const decisions = normalizeDecisions(JSON.parse(await fs.readFile(decisionsPath, "utf8")));
  const receiptDecision = decisions.get("receipt_precedence");
  const imageDecision = decisions.get("duplicate_images");
  if (!receiptDecision || !imageDecision) throw new Error("A形式のHITL回答2件がそろっていません。");

  const sheet = workbook.worksheets.getItem("8月");
  const values = sheet.getUsedRange().values;
  const headerIndex = values.findIndex((row) => row.some((cell) => String(cell ?? "").trim() === "No."));
  if (headerIndex < 0) throw new Error("8月シートの見出しが見つかりません。");
  const columns = mapHeaderColumns(values[headerIndex], ALIASES);
  const receipts = await loadReceiptAnalysis(ocrJsonPath);
  const receiptById = new Map(receipts.filter((receipt) => receipt.receiptId).map((receipt) => [receipt.receiptId, receipt]));
  let correctedRows = 0;

  if (receiptDecision.optionId === "receipt") {
    for (let rowIndex = headerIndex + 1; rowIndex < values.length; rowIndex += 1) {
      const numberText = String(values[rowIndex]?.[columns.number] ?? "").trim();
      if (!numberText || !Number.isFinite(Number(numberText))) continue;
      const receiptId = String(values[rowIndex][columns.evidence] ?? "").trim();
      const receipt = receiptById.get(receiptId);
      if (!receipt) continue;
      const excelRow = rowIndex + 1;
      const currentDate = parseFlexibleDate(values[rowIndex][columns.usedDate], 2026);
      const currentNet = parseMoney(values[rowIndex][columns.net]);
      const currentTax = parseMoney(values[rowIndex][columns.tax]);
      const currentTotal = currentNet != null && currentTax != null ? currentNet + currentTax : null;
      const targetDate = parseFlexibleDate(receipt.date, 2026);
      const targetTotal = receipt.totalYen;
      let changed = false;
      if (targetDate && (!currentDate || currentDate.getTime() !== targetDate.getTime())) {
        sheet.getRangeByIndexes(rowIndex, columns.usedDate, 1, 1).values = [[targetDate]];
        changed = true;
      }
      if (targetTotal != null && currentTotal !== targetTotal) {
        const taxRatio = currentTotal && currentTax != null ? currentTax / currentTotal : 0.1 / 1.1;
        const nextTax = Math.round(targetTotal * taxRatio);
        const nextNet = targetTotal - nextTax;
        sheet.getRangeByIndexes(rowIndex, columns.net, 1, 2).values = [[nextNet, nextTax]];
        sheet.getRangeByIndexes(rowIndex, columns.total, 1, 1).formulas = [[`=G${excelRow}+H${excelRow}`]];
        changed = true;
      }
      if (changed) {
        correctedRows += 1;
        sheet.getRangeByIndexes(rowIndex, columns.check, 1, 1).values = [["HITL回答反映済（証憑優先）"]];
      }
    }
  }

  const receiptPolicy = addReceiptDecisionSheet(workbook, receipts, imageDecision.optionId);
  const appliedRows = {
    receipt_precedence: receiptDecision.optionId === "receipt" ? `${correctedRows}行を証憑へ合わせて修正` : "台帳を維持（自動変更なし）",
    duplicate_images: imageDecision.optionId === "group"
      ? `${receiptPolicy.rowCount}画像を${receiptPolicy.groupCount}証憑へ論理グループ化（画像は保持）`
      : imageDecision.optionId === "keep" ? "全画像を別画像として保持" : "回答保留として保持",
  };
  addFinalAnswerSheet(workbook, decisions, appliedRows, PALETTES.purple);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
  const report = {
    schema: "expense-receipt-final-v1",
    source: { path: inputPath, sha256: await sha256File(inputPath) },
    output: { path: outputPath, sha256: await sha256File(outputPath) },
    decisions: Object.fromEntries(decisions),
    appliedRows,
  };
  await writeJson(reportPath, report);
  return report;
}
