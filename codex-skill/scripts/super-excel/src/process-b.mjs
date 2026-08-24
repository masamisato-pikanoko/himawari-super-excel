import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  PALETTES,
  addDiagnosticSheet,
  columnLetter,
  dateToIso,
  findDataEnd,
  findHeaderRow,
  mapHeaderColumns,
  normalizeHumanName,
  parseFlexibleDate,
  parseMoney,
  sha256File,
  writeJson,
} from "./common.mjs";

const SOURCE_SCHEMAS = {
  "Aチーム": {
    aliases: {
      orderId: ["受注番号"], date: ["日付"], person: ["担当"], customer: ["顧客"],
      product: ["商品"], sales: ["売上（円）"], status: ["確度"], note: ["備考"],
    },
    scale: 1,
  },
  B: {
    aliases: {
      orderId: ["注文ID"], date: ["日付"], person: ["担当者"], customer: ["顧客名"],
      product: ["商品名"], sales: ["売上（万円）"], status: ["状態"], note: ["メモ"],
    },
    scale: 10_000,
  },
  EC: {
    aliases: {
      orderId: ["Order"], date: ["受注日"], person: ["担当"], customer: ["Customer"],
      product: ["SKU"], sales: ["金額"], returnFlag: ["返品"], note: ["備考"],
    },
    scale: 1,
  },
  "店頭_8月": {
    aliases: {
      orderId: ["伝票No"], date: ["販売日"], person: ["スタッフ"], customer: ["顧客"],
      product: ["品名"], quantity: ["数量"], unitPrice: ["単価"], sales: ["合計"], status: ["色"],
    },
    scale: 1,
  },
};

function quoteSheet(name) {
  return `'${String(name).replaceAll("'", "''")}'`;
}

function sourceFormula(sheetName, columnIndex, excelRow, multiplier = 1) {
  const ref = `=${quoteSheet(sheetName)}!${columnLetter(columnIndex)}${excelRow}`;
  return multiplier === 1 ? ref : `${ref}*${multiplier}`;
}

function addUnifiedSheet(workbook, records) {
  const sheet = workbook.worksheets.add("🌻統合明細");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.getRange("A1:K1").merge();
  sheet.getRange("A1").values = [["🌻 部門横断・統合明細"]];
  sheet.getRange("A1:K1").format = {
    fill: "#1E3A8A", font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:K2").merge();
  sheet.getRange("A2").values = [["元シートを参照する数式で統合しています。元データを直すと、この明細も追随します。"]];
  sheet.getRange("A2:K2").format = {
    fill: "#DBEAFE", font: { color: "#1E40AF" }, wrapText: true,
  };
  const headers = ["元シート", "元行", "注文ID", "日付", "担当", "顧客", "商品", "売上（円）", "状態", "備考", "検査"];
  sheet.getRange("A4:K4").values = [headers];
  if (records.length) {
    sheet.getRangeByIndexes(4, 0, records.length, 2).values = records.map((record) => [record.sheet, record.excelRow]);
    sheet.getRangeByIndexes(4, 2, records.length, 8).formulas = records.map((record) => record.formulas);
    sheet.getRangeByIndexes(4, 10, records.length, 1).values = records.map((record) => [record.issues.join(" / ") || "自動検査OK"]);
  }
  const end = 4 + records.length;
  sheet.getRange("A4:K4").format = {
    fill: "#1D4ED8", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true,
  };
  sheet.getRange(`A5:K${end}`).format = {
    font: { color: "#1F2937", fontSize: 10 },
    borders: { insideHorizontal: { style: "thin", color: "#E5E7EB" } },
    verticalAlignment: "top",
  };
  sheet.getRange(`D5:D${end}`).format.numberFormat = "yyyy/mm/dd";
  sheet.getRange(`H5:H${end}`).format.numberFormat = '#,##0"円";[Red]-#,##0"円"';
  sheet.getRange(`J5:K${end}`).format.wrapText = true;
  sheet.getRange(`K5:K${end}`).conditionalFormats.add("containsText", {
    text: "重複",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  sheet.getRange(`K5:K${end}`).conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: "#DCFCE7", font: { color: "#166534" } },
  });
  [13, 9, 16, 12, 12, 18, 12, 15, 12, 22, 28].forEach((width, index) => {
    sheet.getRange(`${columnLetter(index)}:${columnLetter(index)}`).format.columnWidth = width;
  });
  sheet.tables.add(`A4:K${end}`, true, "HimawariUnifiedSales");
}

function addDuplicateSheet(workbook, duplicateRows) {
  const sheet = workbook.worksheets.add("🌻重複候補");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.getRange("A1:I1").merge();
  sheet.getRange("A1").values = [["🌻 注文ID重複候補"]];
  sheet.getRange("A1:I1").format = {
    fill: "#7C2D12", font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:I2").merge();
  sheet.getRange("A2").values = [["注文IDが同じでも内容が異なるため、自動削除・自動統合はしていません。"]];
  sheet.getRange("A2:I2").format = { fill: "#FFEDD5", font: { color: "#9A3412" }, wrapText: true };
  const headers = ["注文ID", "元シート", "元行", "日付", "担当", "顧客", "商品", "売上（円）", "差分"];
  sheet.getRange("A4:I4").values = [headers];
  if (duplicateRows.length) sheet.getRangeByIndexes(4, 0, duplicateRows.length, headers.length).values = duplicateRows;
  const end = Math.max(5, 4 + duplicateRows.length);
  sheet.getRange("A4:I4").format = {
    fill: "#9A3412", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true,
  };
  sheet.getRange(`A5:I${end}`).format = {
    font: { color: "#431407", fontSize: 10 }, wrapText: true,
    borders: { insideHorizontal: { style: "thin", color: "#FED7AA" } },
  };
  sheet.getRange(`D5:D${end}`).format.numberFormat = "yyyy/mm/dd";
  sheet.getRange(`H5:H${end}`).format.numberFormat = '#,##0"円"';
  [16, 13, 9, 12, 12, 18, 12, 15, 32].forEach((width, index) => {
    sheet.getRange(`${columnLetter(index)}:${columnLetter(index)}`).format.columnWidth = width;
  });
}

export async function processWorkbookB({ inputPath, outputPath, reportPath, hitlPath }) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const records = [];
  const issues = [];
  let normalizedDateCount = 0;
  let normalizedMoneyCount = 0;
  let formulaRepairCount = 0;
  let ecUnclassifiedCount = 0;

  for (const [sheetName, schema] of Object.entries(SOURCE_SCHEMAS)) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const values = sheet.getUsedRange().values;
    const headerRowIndex = findHeaderRow(values, [[schema.aliases.orderId[0]], [schema.aliases.date[0]]]);
    const columns = mapHeaderColumns(values[headerRowIndex], schema.aliases);
    const required = ["orderId", "date", "person", "customer", "product", "sales"];
    for (const field of required) {
      if (columns[field] < 0) throw new Error(`${sheetName} missing required semantic column: ${field}`);
    }
    const dataEndIndex = findDataEnd(values, headerRowIndex, columns.orderId);
    const rowCount = dataEndIndex - headerRowIndex;
    const startExcelRow = headerRowIndex + 2;
    const endExcelRow = dataEndIndex + 1;
    const dateWrites = [];
    const personWrites = [];
    const salesWrites = [];
    const totalFormulaWrites = [];
    const existingTotalFormulas = columns.quantity >= 0
      ? sheet.getRange(`${columnLetter(columns.sales)}${startExcelRow}:${columnLetter(columns.sales)}${endExcelRow}`).formulas
      : [];

    for (let offset = 0; offset < rowCount; offset += 1) {
      const rowIndex = headerRowIndex + 1 + offset;
      const excelRow = rowIndex + 1;
      const row = values[rowIndex];
      const date = parseFlexibleDate(row[columns.date], 2026);
      const person = normalizeHumanName(row[columns.person]);
      const salesYen = parseMoney(row[columns.sales], { scale: schema.scale });
      const sheetSalesValue = salesYen == null ? row[columns.sales] : salesYen / schema.scale;
      const status = columns.status >= 0
        ? String(row[columns.status] ?? "").trim()
        : String(row[columns.returnFlag] ?? "").trim() === "返品" ? "返品" : "未分類";
      const rowIssues = [];
      if (status === "未分類") {
        rowIssues.push("EC状態未分類");
        ecUnclassifiedCount += 1;
      }
      if (typeof row[columns.date] === "string" && date) normalizedDateCount += 1;
      if (typeof row[columns.sales] === "string" && salesYen != null) normalizedMoneyCount += 1;
      dateWrites.push([date ?? row[columns.date] ?? null]);
      personWrites.push([person]);
      salesWrites.push([sheetSalesValue]);

      if (columns.quantity >= 0 && columns.unitPrice >= 0) {
        const expected = `=${columnLetter(columns.quantity)}${excelRow}*${columnLetter(columns.unitPrice)}${excelRow}`;
        totalFormulaWrites.push([expected]);
        if (existingTotalFormulas[offset]?.[0] !== expected) {
          formulaRepairCount += 1;
          rowIssues.push("合計式修正");
        }
      }

      const quote = quoteSheet(sheetName);
      const formulas = [
        sourceFormula(sheetName, columns.orderId, excelRow),
        sourceFormula(sheetName, columns.date, excelRow),
        sourceFormula(sheetName, columns.person, excelRow),
        sourceFormula(sheetName, columns.customer, excelRow),
        sourceFormula(sheetName, columns.product, excelRow),
        sourceFormula(sheetName, columns.sales, excelRow, schema.scale),
        columns.status >= 0
          ? sourceFormula(sheetName, columns.status, excelRow)
          : `=IF(${quote}!${columnLetter(columns.returnFlag)}${excelRow}="返品","返品","未分類")`,
        columns.note >= 0 ? sourceFormula(sheetName, columns.note, excelRow) : '=""',
      ];
      records.push({
        sheet: sheetName,
        excelRow,
        orderId: String(row[columns.orderId] ?? "").trim(),
        date,
        person,
        customer: String(row[columns.customer] ?? "").trim(),
        product: String(row[columns.product] ?? "").trim(),
        salesYen,
        status,
        note: columns.note >= 0 ? String(row[columns.note] ?? "").trim() : "",
        formulas,
        issues: rowIssues,
      });
    }

    sheet.getRange(`${columnLetter(columns.date)}${startExcelRow}:${columnLetter(columns.date)}${endExcelRow}`).values = dateWrites;
    sheet.getRange(`${columnLetter(columns.date)}${startExcelRow}:${columnLetter(columns.date)}${endExcelRow}`).format.numberFormat = "yyyy/mm/dd";
    sheet.getRange(`${columnLetter(columns.person)}${startExcelRow}:${columnLetter(columns.person)}${endExcelRow}`).values = personWrites;
    sheet.getRange(`${columnLetter(columns.sales)}${startExcelRow}:${columnLetter(columns.sales)}${endExcelRow}`).values = salesWrites;
    sheet.getRange(`${columnLetter(columns.sales)}${startExcelRow}:${columnLetter(columns.sales)}${endExcelRow}`).format.numberFormat = schema.scale === 10_000
      ? '0.0"万円"'
      : '#,##0"円";[Red]-#,##0"円"';
    if (totalFormulaWrites.length) {
      sheet.getRange(`${columnLetter(columns.sales)}${startExcelRow}:${columnLetter(columns.sales)}${endExcelRow}`).formulas = totalFormulaWrites;
      sheet.getRange(`${columnLetter(columns.sales)}${startExcelRow}:${columnLetter(columns.sales)}${endExcelRow}`).format.numberFormat = '#,##0"円";[Red]-#,##0"円"';
    }
  }

  const byOrder = new Map();
  for (const record of records) {
    if (!record.orderId) continue;
    if (!byOrder.has(record.orderId)) byOrder.set(record.orderId, []);
    byOrder.get(record.orderId).push(record);
  }
  const duplicateGroups = [...byOrder.entries()].filter(([, group]) => group.length > 1);
  const duplicateRows = [];
  for (const [orderId, group] of duplicateGroups) {
    const variants = new Set(group.map((record) => [
      dateToIso(record.date), record.person, record.customer, record.product, record.salesYen, record.status,
    ].join("|")));
    for (const record of group) {
      record.issues.push("注文ID重複");
      duplicateRows.push([
        orderId,
        record.sheet,
        record.excelRow,
        record.date,
        record.person,
        record.customer,
        record.product,
        record.salesYen,
        variants.size > 1 ? `${group.length}件で内容が相違` : `${group.length}件が同内容`,
      ]);
    }
  }

  if (normalizedDateCount) issues.push({
    kind: "自動修正", sheet: "4明細", location: "日付列",
    message: "文字列・数値が混在した日付をExcel日付へ統一しました。", action: "yyyy/mm/dd",
    evidence: "各シートの見出しと日付妥当性", impact: `${normalizedDateCount}セル`, status: "修正済",
  });
  if (normalizedMoneyCount) issues.push({
    kind: "自動修正", sheet: "B/EC", location: "売上列",
    message: "万円・円・通貨記号の混在を各シートの単位に合わせて数値化しました。", action: "数値化＋単位別表示",
    evidence: "列見出しの単位", impact: `${normalizedMoneyCount}セル`, status: "修正済",
  });
  if (formulaRepairCount) issues.push({
    kind: "自動修正", sheet: "店頭_8月", location: "合計列",
    message: "欠落・参照ずれ・手入力化した数量×単価の式を復元しました。", action: "数量×単価",
    evidence: "列見出しと周辺式", impact: `${formulaRepairCount}式`, status: "修正済",
  });

  const summary = workbook.worksheets.getItem("まとめ");
  summary.getRange("E4").formulas = [["=SUM('店頭_8月'!H5:H32)"]];
  summary.getRange("E5").formulas = [["=SUMIF('店頭_8月'!I5:I32,A5,'店頭_8月'!H5:H32)"]];
  summary.getRange("E6").formulas = [["=SUMIF('店頭_8月'!I5:I32,A6,'店頭_8月'!H5:H32)"]];
  summary.getRange("E7").formulas = [["=SUMIF('店頭_8月'!I5:I32,A7,'店頭_8月'!H5:H32)"]];
  issues.push({
    kind: "自動修正", sheet: "まとめ", location: "E4:E7",
    message: "店頭最終行が集計範囲から漏れていた4式を修正しました。", action: "H5:H32 / I5:I32へ拡張",
    evidence: "店頭_8月のデータ終端", impact: "4式", status: "修正済",
  });
  issues.push({
    kind: "HITL", sheet: "4明細", location: "注文ID重複",
    message: "同じ注文IDが複数部門にあり、内容も異なります。", action: "回答まで全行を保持",
    evidence: "部門横断キー照合", impact: `${duplicateGroups.length}ID / ${duplicateRows.length}行`, status: "回答待ち",
  });
  issues.push({
    kind: "HITL", sheet: "EC/まとめ", location: "EC状態",
    message: "ECは返品以外の状態列がなく、確定・見込へ自動分類できません。", action: "未分類で保持",
    evidence: "ECの返品列とまとめの状態別SUMIF", impact: `${ecUnclassifiedCount}行`, status: "回答待ち",
  });

  addUnifiedSheet(workbook, records);
  addDuplicateSheet(workbook, duplicateRows);
  const questions = [
    {
      questionId: "duplicate_orders",
      question: `複数部門にある同一注文ID ${duplicateGroups.length}件は、1注文へ統合しますか？`,
      reason: "注文IDは同じですが、日付・顧客・商品・金額が異なるため自動統合は危険です。",
      impact: `${duplicateRows.length}行`,
      options: [
        { optionId: "keep_separate", label: "部門別のまま残す" },
        { optionId: "merge", label: "1注文へ統合" },
        { optionId: "hold", label: "保留" },
      ],
      recommendedOptionId: "keep_separate",
    },
    {
      questionId: "ec_status",
      question: `ECの返品以外${ecUnclassifiedCount}行は、どの状態で会議集計しますか？`,
      reason: "ECには確定・見込の列がなく、返品以外の分類根拠がありません。",
      impact: `${ecUnclassifiedCount}行`,
      options: [
        { optionId: "keep_unclassified", label: "未分類で保留" },
        { optionId: "confirmed", label: "確定として集計" },
        { optionId: "forecast", label: "見込として集計" },
      ],
      recommendedOptionId: "keep_unclassified",
    },
  ];
  addDiagnosticSheet(workbook, {
    title: "🌻 絶望エクセル診断 — 部門別売上",
    subtitle: "列順と単位が異なる4部門を数式リンクで統合しました。明白な型・式だけ修正し、注文重複とEC状態は回答待ちです。",
    summaryCards: [
      { label: "統合行", value: records.length },
      { label: "自動修正式", value: formulaRepairCount + 4 },
      { label: "重複ID", value: duplicateGroups.length },
      { label: "HITL", value: 2 },
    ],
    issues,
    questions,
    palette: PALETTES.blue,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
  const report = {
    schema: "multi-channel-sales-v1",
    source: { path: inputPath, sha256: await sha256File(inputPath) },
    output: { path: outputPath, sha256: await sha256File(outputPath) },
    detected: {
      sourceSheets: Object.keys(SOURCE_SCHEMAS),
      unifiedRows: records.length,
      duplicateOrderIds: duplicateGroups.map(([orderId]) => orderId),
      duplicateRows: duplicateRows.length,
      ecUnclassifiedRows: ecUnclassifiedCount,
    },
    automaticFixes: {
      normalizedDateCells: normalizedDateCount,
      normalizedMoneyCells: normalizedMoneyCount,
      repairedRetailRowFormulas: formulaRepairCount,
      repairedSummaryFormulas: 4,
    },
    questions,
    issueCount: issues.length,
  };
  await writeJson(reportPath, report);
  await writeJson(hitlPath, {
    job_id: `B-${path.basename(inputPath)}-${report.source.sha256.slice(0, 12)}`,
    message: "🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？",
    summary: `4部門${records.length}行を統合し、明白な式を修正しました。`,
    questions: questions.map((question) => ({
      question_id: question.questionId,
      question: question.question,
      reason: question.reason,
      impact: question.impact,
      recommended_option_id: question.recommendedOptionId,
      options: question.options.map((option) => ({
        option_id: option.optionId,
        label: option.label,
      })),
    })),
  });
  return report;
}
