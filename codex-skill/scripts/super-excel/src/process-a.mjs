import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  PALETTES,
  addDiagnosticSheet,
  dateToIso,
  findHeaderRow,
  mapHeaderColumns,
  normalizeHumanName,
  parseFlexibleDate,
  parseMoney,
  sha256File,
  writeJson,
} from "./common.mjs";
import { loadReceiptAnalysis } from "./receipt-analysis.mjs";

const ALIASES = {
  number: ["No.", "No", "番号"],
  appliedDate: ["申請日"],
  usedDate: ["利用日"],
  person: ["氏名", "申請者"],
  category: ["費目", "勘定科目"],
  description: ["内容", "摘要"],
  net: ["税抜", "税抜金額"],
  tax: ["消費税", "税額"],
  total: ["合計", "税込"],
  evidence: ["証憑", "領収番号"],
  check: ["確認", "チェック"],
};

function a1Row(rowIndexZeroBased) {
  return rowIndexZeroBased + 1;
}

function formatComparison(rowDate, rowTotal, receipt) {
  const dateMismatch = receipt.date && rowDate && receipt.date !== rowDate;
  const totalMismatch = receipt.totalYen != null && rowTotal != null && receipt.totalYen !== rowTotal;
  if (dateMismatch && totalMismatch) return "日付・金額不一致";
  if (dateMismatch) return "日付不一致";
  if (totalMismatch) return "金額不一致";
  return "一致";
}

function addReceiptSheet(workbook, rows) {
  const sheet = workbook.worksheets.add("🌻証憑照合");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(4);
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1").values = [["🌻 証憑画像と台帳の照合結果"]];
  sheet.getRange("A1:J1").format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:J2").merge();
  sheet.getRange("A2").values = [["Azure OCRの構造化結果。証憑が台帳と矛盾する項目は自動上書きせず、HITL回答待ちです。"]];
  sheet.getRange("A2:J2").format = {
    fill: "#CCFBF1",
    font: { color: "#115E59" },
    wrapText: true,
  };
  const headers = ["画像", "証憑ID", "画像日付", "画像合計", "台帳行", "台帳利用日", "台帳合計", "照合", "重複候補", "OCR信頼度"];
  sheet.getRange("A4:J4").values = [headers];
  if (rows.length) sheet.getRangeByIndexes(4, 0, rows.length, headers.length).values = rows;
  sheet.getRange("A4:J4").format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    wrapText: true,
  };
  const end = Math.max(5, 4 + rows.length);
  sheet.getRange(`A5:J${end}`).format = {
    font: { color: "#1F2937", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "top",
    borders: { insideHorizontal: { style: "thin", color: "#E5E7EB" } },
  };
  sheet.getRange(`D5:D${end}`).format.numberFormat = '#,##0"円"';
  sheet.getRange(`G5:G${end}`).format.numberFormat = '#,##0"円"';
  sheet.getRange(`H5:H${end}`).conditionalFormats.add("containsText", {
    text: "不一致",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  [18, 12, 12, 13, 14, 18, 13, 16, 30, 12].forEach((width, index) => {
    const letter = String.fromCharCode(65 + index);
    sheet.getRange(`${letter}:${letter}`).format.columnWidth = width;
  });
  sheet.getRange(`A4:J${end}`).format.autofitRows();
}

export async function processWorkbookA({ inputPath, ocrJsonPath, outputPath, reportPath, hitlPath }) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const sheet = workbook.worksheets.getItem("8月");
  const values = sheet.getUsedRange().values;
  const headerRowIndex = findHeaderRow(values, [["No.", "No"], ["申請日"], ["合計"]]);
  const columns = mapHeaderColumns(values[headerRowIndex], ALIASES);
  const required = ["number", "appliedDate", "usedDate", "net", "tax", "total", "evidence", "check"];
  for (const field of required) {
    if (columns[field] < 0) throw new Error(`A workbook missing required semantic column: ${field}`);
  }
  const dataEndIndex = values.reduce((last, row, index) => {
    if (index <= headerRowIndex) return last;
    const numberText = String(row?.[columns.number] ?? "").trim();
    return numberText !== "" && Number.isFinite(Number(numberText)) ? index : last;
  }, headerRowIndex);
  const rowCount = dataEndIndex - headerRowIndex;
  const startExcelRow = a1Row(headerRowIndex + 1);
  const endExcelRow = a1Row(dataEndIndex);
  const inferredYear = 2026;

  const receipts = await loadReceiptAnalysis(ocrJsonPath);
  const receiptById = new Map();
  for (const receipt of receipts) {
    if (receipt.receiptId && !receiptById.has(receipt.receiptId)) receiptById.set(receipt.receiptId, receipt);
  }

  const evidenceRows = new Map();
  for (let rowIndex = headerRowIndex + 1; rowIndex <= dataEndIndex; rowIndex += 1) {
    const evidence = String(values[rowIndex][columns.evidence] ?? "").trim();
    if (!evidence) continue;
    if (!evidenceRows.has(evidence)) evidenceRows.set(evidence, []);
    evidenceRows.get(evidence).push(rowIndex);
  }

  const categorySheet = workbook.worksheets.getItem("費目");
  const categoryValues = categorySheet.getUsedRange().values;
  const registeredCategories = new Set(categoryValues.slice(1).map((row) => String(row[0] ?? "").trim()).filter(Boolean));

  const dateWrites = [];
  const useDateWrites = [];
  const personWrites = [];
  const netWrites = [];
  const taxWrites = [];
  const checkWrites = [];
  const formulaWrites = [];
  const issues = [];
  const ledgerRecords = [];
  let normalizedDateCount = 0;
  let normalizedMoneyCount = 0;
  let formulaRepairCount = 0;
  let receiptMismatchCount = 0;
  let missingEvidenceCount = 0;
  let duplicateEvidenceCount = 0;

  const existingFormulas = sheet.getRange(`I${startExcelRow}:I${endExcelRow}`).formulas;
  for (let offset = 0; offset < rowCount; offset += 1) {
    const rowIndex = headerRowIndex + 1 + offset;
    const excelRow = a1Row(rowIndex);
    const row = values[rowIndex];
    const appliedDate = parseFlexibleDate(row[columns.appliedDate], inferredYear);
    const usedDate = parseFlexibleDate(row[columns.usedDate], inferredYear);
    const net = parseMoney(row[columns.net]);
    const tax = parseMoney(row[columns.tax]);
    const total = net != null && tax != null ? net + tax : null;
    const evidence = String(row[columns.evidence] ?? "").trim();
    const person = normalizeHumanName(row[columns.person]);
    const category = String(row[columns.category] ?? "").trim();
    const flags = [];

    if (appliedDate && !(row[columns.appliedDate] instanceof Date)) {
      if (typeof row[columns.appliedDate] === "string") normalizedDateCount += 1;
    }
    if (usedDate && typeof row[columns.usedDate] === "string") normalizedDateCount += 1;
    if (typeof row[columns.net] === "string" && net != null) normalizedMoneyCount += 1;
    if (typeof row[columns.tax] === "string" && tax != null) normalizedMoneyCount += 1;

    dateWrites.push([appliedDate ?? row[columns.appliedDate] ?? null]);
    useDateWrites.push([usedDate ?? row[columns.usedDate] ?? null]);
    personWrites.push([person]);
    netWrites.push([net ?? row[columns.net] ?? null]);
    taxWrites.push([tax ?? row[columns.tax] ?? null]);
    formulaWrites.push([`=G${excelRow}+H${excelRow}`]);
    if (existingFormulas[offset]?.[0] !== `=G${excelRow}+H${excelRow}`) formulaRepairCount += 1;

    if (appliedDate && usedDate && appliedDate.getTime() < usedDate.getTime()) {
      flags.push("申請日＜利用日");
      issues.push({
        kind: "要確認", sheet: "8月", location: `行${excelRow}`,
        message: "申請日が利用日より前です。", action: "変更せずフラグ付与",
        evidence: `${dateToIso(appliedDate)} < ${dateToIso(usedDate)}`, impact: "1行", status: "要確認",
      });
    }
    if (!registeredCategories.has(category)) {
      flags.push("未登録費目");
      issues.push({
        kind: "要確認", sheet: "8月", location: `E${excelRow}`,
        message: `費目「${category}」が費目マスタにありません。`, action: "変更せずフラグ付与",
        evidence: "費目!A2:A9", impact: "1セル", status: "要確認",
      });
    }
    if (!evidence) {
      missingEvidenceCount += 1;
      flags.push("証憑IDなし");
    } else if ((evidenceRows.get(evidence) ?? []).length > 1) {
      duplicateEvidenceCount += 1;
      flags.push("証憑ID重複");
    }

    const receipt = receiptById.get(evidence);
    const comparison = receipt
      ? formatComparison(dateToIso(usedDate), total, receipt)
      : "画像なし";
    if (receipt && comparison !== "一致") {
      receiptMismatchCount += 1;
      flags.push("証憑不一致");
    }
    checkWrites.push([flags.length ? flags.join(" / ") : "自動検査OK"]);
    ledgerRecords.push({
      rowIndex,
      excelRow,
      evidence,
      usedDate: dateToIso(usedDate),
      total,
      comparison,
    });
  }

  sheet.getRange(`B${startExcelRow}:B${endExcelRow}`).values = dateWrites;
  sheet.getRange(`C${startExcelRow}:C${endExcelRow}`).values = useDateWrites;
  sheet.getRange(`D${startExcelRow}:D${endExcelRow}`).values = personWrites;
  sheet.getRange(`G${startExcelRow}:G${endExcelRow}`).values = netWrites;
  sheet.getRange(`H${startExcelRow}:H${endExcelRow}`).values = taxWrites;
  sheet.getRange(`I${startExcelRow}:I${endExcelRow}`).formulas = formulaWrites;
  sheet.getRange(`K${startExcelRow}:K${endExcelRow}`).values = checkWrites;
  sheet.getRange(`B${startExcelRow}:C${endExcelRow}`).format.numberFormat = "yyyy/mm/dd";
  sheet.getRange(`G${startExcelRow}:I${endExcelRow}`).format.numberFormat = '#,##0"円";[Red]-#,##0"円"';
  sheet.getRange(`K${startExcelRow}:K${endExcelRow}`).format.wrapText = true;
  sheet.getRange(`K${startExcelRow}:K${endExcelRow}`).conditionalFormats.add("containsText", {
    text: "不一致",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  sheet.getRange(`K${startExcelRow}:K${endExcelRow}`).conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: "#DCFCE7", font: { color: "#166534" } },
  });

  const totalLabelRows = values
    .map((row, index) => ({ index, value: String(row[0] ?? "").trim() }))
    .filter((entry) => entry.value === "合計");
  if (totalLabelRows.length) {
    const totalRow = a1Row(totalLabelRows.at(-1).index);
    sheet.getRange(`I${totalRow}`).formulas = [[`=SUM(I${startExcelRow}:I${endExcelRow})`]];
    issues.push({
      kind: "自動修正", sheet: "8月", location: `I${totalRow}`,
      message: "合計式の末尾行漏れを修正しました。", action: `SUM(I${startExcelRow}:I${endExcelRow})`,
      evidence: "データ終端をNo.列から再検出", impact: "1式", status: "修正済",
    });
  }

  if (normalizedDateCount) issues.unshift({
    kind: "自動修正", sheet: "8月", location: `B${startExcelRow}:C${endExcelRow}`,
    message: "文字列・数値が混在した日付をExcel日付へ統一しました。", action: "yyyy/mm/dd",
    evidence: "日付として妥当な値のみ変換", impact: `${normalizedDateCount}セル`, status: "修正済",
  });
  if (normalizedMoneyCount) issues.unshift({
    kind: "自動修正", sheet: "8月", location: `G${startExcelRow}:H${endExcelRow}`,
    message: "通貨記号付き文字列を数値へ統一しました。", action: "数値化＋円表示形式",
    evidence: "￥・¥・円・桁区切りを除去して厳密変換", impact: `${normalizedMoneyCount}セル`, status: "修正済",
  });
  if (formulaRepairCount) issues.unshift({
    kind: "自動修正", sheet: "8月", location: `I${startExcelRow}:I${endExcelRow}`,
    message: "欠落・参照ずれ・手入力化した合計式を行単位で復元しました。", action: "税抜＋消費税",
    evidence: "列見出しと周辺式の一貫性", impact: `${formulaRepairCount}式`, status: "修正済",
  });
  issues.push({
    kind: "HITL", sheet: "8月/貼付", location: "証憑ID一致行",
    message: "画像と台帳で日付または金額が一致しない行があります。", action: "回答まで台帳値を維持",
    evidence: "Azure OCR＋証憑ID照合", impact: `${receiptMismatchCount}行`, status: "回答待ち",
  });
  issues.push({
    kind: "HITL", sheet: "貼付/追加添付", location: "画像群",
    message: "同一証憑の重複画像・切り抜き画像があります。", action: "回答まで全画像を保持",
    evidence: "証憑ID・日付・金額・OCR本文", impact: "画像候補", status: "回答待ち",
  });

  const receiptRows = receipts.map((receipt) => {
    const matched = ledgerRecords.filter((row) => row.evidence === receipt.receiptId);
    const averageConfidence = receipt.ocrWords.length
      ? receipt.ocrWords.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / receipt.ocrWords.length
      : 0;
    const comparisons = matched.length ? [...new Set(matched.map((row) => row.comparison))].join(" / ") : "台帳IDなし";
    return [
      receipt.file,
      receipt.receiptId || (receipt.auth ? `AUTH ${receipt.auth}` : "ID不明"),
      receipt.date,
      receipt.totalYen,
      matched.map((row) => row.excelRow).join(", "),
      matched.map((row) => row.usedDate).join(", "),
      matched.map((row) => row.total).join(", "),
      comparisons,
      receipt.duplicateCandidates.map((candidate) => candidate.file).join(", "),
      averageConfidence,
    ];
  });
  addReceiptSheet(workbook, receiptRows);

  const questions = [
    {
      questionId: "receipt_precedence",
      question: `証憑と台帳が違う${receiptMismatchCount}行は、証憑の日付・金額へ修正しますか？`,
      reason: "証憑IDで紐づく画像と、台帳の利用日または合計が一致しません。",
      impact: `${receiptMismatchCount}行`,
      options: [
        { optionId: "receipt", label: "証憑を優先して修正" },
        { optionId: "ledger", label: "台帳を維持" },
        { optionId: "hold", label: "保留" },
      ],
      recommendedOptionId: "receipt",
    },
    {
      questionId: "duplicate_images",
      question: "重複・切り抜きと思われる画像は1証憑へまとめますか？",
      reason: "同じ証憑ID・日付・金額の画像と、IDが欠けた切り抜き画像があります。",
      impact: "重複候補画像",
      options: [
        { optionId: "group", label: "1証憑へまとめる" },
        { optionId: "keep", label: "別画像で残す" },
        { optionId: "hold", label: "保留" },
      ],
      recommendedOptionId: "group",
    },
  ];
  addDiagnosticSheet(workbook, {
    title: "🌻 絶望エクセル診断 — 経費・証憑",
    subtitle: "原本は変更していません。このファイルでは確実な型・式だけ自動修正し、証憑判断は2問の回答待ちにしています。",
    summaryCards: [
      { label: "明細", value: rowCount },
      { label: "自動修正式", value: formulaRepairCount },
      { label: "証憑不一致", value: receiptMismatchCount },
      { label: "HITL", value: 2 },
    ],
    issues,
    questions,
    palette: PALETTES.purple,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await (await SpreadsheetFile.exportXlsx(workbook)).save(outputPath);
  const report = {
    schema: "expense-receipt-v1",
    source: { path: inputPath, sha256: await sha256File(inputPath) },
    output: { path: outputPath, sha256: await sha256File(outputPath) },
    detected: {
      sheets: workbook.worksheets.items.map((item) => item.name),
      rows: rowCount,
      embeddedAndAttachedImages: receipts.length,
      receiptMismatches: receiptMismatchCount,
      missingEvidenceRows: missingEvidenceCount,
      duplicateEvidenceRows: duplicateEvidenceCount,
    },
    automaticFixes: {
      normalizedDateCells: normalizedDateCount,
      normalizedMoneyCells: normalizedMoneyCount,
      repairedRowFormulas: formulaRepairCount,
      repairedGrandTotal: Boolean(totalLabelRows.length),
    },
    questions,
    issueCount: issues.length,
  };
  await writeJson(reportPath, report);
  await writeJson(hitlPath, {
    job_id: `A-${path.basename(inputPath)}-${report.source.sha256.slice(0, 12)}`,
    message: "🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？",
    summary: `確実な型・式を修正し、${receiptMismatchCount}行の証憑不一致を保留しています。`,
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
