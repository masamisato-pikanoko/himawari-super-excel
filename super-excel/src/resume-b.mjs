import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  PALETTES,
  addFinalAnswerSheet,
  normalizeDecisions,
  parseFlexibleDate,
  sha256File,
  writeJson,
} from "./common.mjs";

function displayDate(value) {
  const date = parseFlexibleDate(value, 2026);
  return date ? date.toISOString().slice(0, 10) : String(value ?? "").trim();
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].join(" / ");
}

function addMergedOrderSheet(workbook, records) {
  const groups = new Map();
  for (const record of records) {
    const orderId = String(record[2] ?? "").trim();
    if (!orderId) continue;
    if (!groups.has(orderId)) groups.set(orderId, []);
    groups.get(orderId).push(record);
  }
  const sheet = workbook.worksheets.add("🌻注文統合案");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.getRange("A1:K1").merge();
  sheet.getRange("A1").values = [["🌻 注文ID単位の統合結果"]];
  sheet.getRange("A1:K1").format = {
    fill: "#7C2D12", font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:K2").merge();
  sheet.getRange("A2").values = [["元明細は削除せず、注文IDごとに売上を合算し、異なる属性は併記しています。"]];
  sheet.getRange("A2:K2").format = { fill: "#FFEDD5", font: { color: "#9A3412" }, wrapText: true };
  const headers = ["注文ID", "明細数", "部門", "日付", "担当", "顧客", "商品", "売上合計", "状態", "元行", "競合属性"];
  sheet.getRange("A4:K4").values = [headers];
  const rows = [...groups.entries()].map(([orderId, items]) => {
    const conflicts = [];
    [[3, "日付"], [4, "担当"], [5, "顧客"], [6, "商品"], [8, "状態"]].forEach(([index, label]) => {
      if (new Set(items.map((item) => String(item[index] ?? "").trim()).filter(Boolean)).size > 1) conflicts.push(label);
    });
    return [
      orderId,
      items.length,
      uniqueText(items.map((item) => item[0])),
      uniqueText(items.map((item) => displayDate(item[3]))),
      uniqueText(items.map((item) => item[4])),
      uniqueText(items.map((item) => item[5])),
      uniqueText(items.map((item) => item[6])),
      items.reduce((sum, item) => sum + (Number(item[7]) || 0), 0),
      uniqueText(items.map((item) => item[8])),
      items.map((item) => `${item[0]}!${item[1]}`).join(", "),
      conflicts.join(" / ") || "なし",
    ];
  });
  if (rows.length) sheet.getRangeByIndexes(4, 0, rows.length, headers.length).values = rows;
  const end = Math.max(5, 4 + rows.length);
  sheet.getRange("A4:K4").format = {
    fill: "#9A3412", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true,
  };
  sheet.getRange(`A5:K${end}`).format = {
    wrapText: true, verticalAlignment: "top",
    borders: { insideHorizontal: { style: "thin", color: "#FED7AA" } },
  };
  sheet.getRange(`H5:H${end}`).format.numberFormat = '#,##0"円"';
  [16, 10, 20, 22, 18, 24, 20, 16, 20, 28, 22].forEach((width, index) => {
    const letter = String.fromCharCode(65 + index);
    sheet.getRange(`${letter}:${letter}`).format.columnWidth = width;
  });
  sheet.getRange(`A1:K${end}`).format.autofitRows();
  return { orderCount: rows.length, multiRowOrderCount: rows.filter((row) => row[1] > 1).length };
}

export async function resumeWorkbookB({ inputPath, decisionsPath, outputPath, reportPath }) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const decisions = normalizeDecisions(JSON.parse(await fs.readFile(decisionsPath, "utf8")));
  const duplicateDecision = decisions.get("duplicate_orders");
  const ecDecision = decisions.get("ec_status");
  if (!duplicateDecision || !ecDecision) throw new Error("B形式のHITL回答2件がそろっていません。");

  const sheet = workbook.worksheets.getItem("🌻統合明細");
  const values = sheet.getUsedRange().values;
  const records = values.slice(4).filter((row) => String(row[0] ?? "").trim() && String(row[2] ?? "").trim());
  let ecChangedRows = 0;
  const status = ecDecision.optionId === "confirmed" ? "確定"
    : ecDecision.optionId === "forecast" ? "見込" : "";
  if (status) {
    for (let offset = 0; offset < records.length; offset += 1) {
      const record = records[offset];
      if (String(record[0]) !== "EC" || String(record[8]) === "返品") continue;
      sheet.getRangeByIndexes(4 + offset, 8, 1, 1).values = [[status]];
      sheet.getRangeByIndexes(4 + offset, 10, 1, 1).values = [[`HITL回答反映済（EC=${status}）`]];
      record[8] = status;
      ecChangedRows += 1;
    }
  }

  let merged = null;
  if (duplicateDecision.optionId === "merge") merged = addMergedOrderSheet(workbook, records);
  const appliedRows = {
    duplicate_orders: duplicateDecision.optionId === "merge"
      ? `${merged.multiRowOrderCount}件の重複注文を注文ID単位で併記・合算（元明細は保持）`
      : duplicateDecision.optionId === "keep_separate" ? "部門別明細を維持" : "判断保留として全明細を保持",
    ec_status: status ? `EC ${ecChangedRows}行を「${status}」として統合明細へ反映` : "EC状態を未分類で保持",
  };
  addFinalAnswerSheet(workbook, decisions, appliedRows, PALETTES.blue);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
  const report = {
    schema: "multi-channel-sales-final-v1",
    source: { path: inputPath, sha256: await sha256File(inputPath) },
    output: { path: outputPath, sha256: await sha256File(outputPath) },
    decisions: Object.fromEntries(decisions),
    appliedRows,
  };
  await writeJson(reportPath, report);
  return report;
}
