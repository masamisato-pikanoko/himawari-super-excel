import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DAY_MS = 86_400_000;
export const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function excelSerialToDate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(EXCEL_EPOCH_MS + Math.round(value * DAY_MS));
}

export function dateToIso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export function parseFlexibleDate(value, inferredYear = 2026) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  const text = String(value ?? "").trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})日?$/);
  if (match) return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (match) return utcDate(inferredYear, Number(match[1]), Number(match[2]));
  match = text.match(/^(\d{1,2})[/.\-](\d{1,2})$/);
  if (match) return utcDate(inferredYear, Number(match[1]), Number(match[2]));
  return null;
}

function utcDate(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
  ) return null;
  return value;
}

export function parseMoney(value, { scale = 1 } = {}) {
  if (typeof value === "number" && Number.isFinite(value)) return value * scale;
  const text = String(value ?? "").trim().replaceAll("，", ",");
  if (!text || /^#/.test(text)) return null;
  const unitScale = /万(?:円)?$/.test(text) ? 10_000 : scale;
  const normalized = text
    .replace(/[￥¥円\s,]/g, "")
    .replace(/万$/, "")
    .replace(/[▲△]/g, "-");
  const number = Number(normalized);
  return Number.isFinite(number) ? number * unitScale : null;
}

export function normalizeHumanName(value) {
  return String(value ?? "")
    .replace(/[\u3000\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_()（）・\-]/g, "");
}

export function safeText(value, maxChars = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxChars);
}

export async function sha256File(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function columnLetter(indexZeroBased) {
  let value = indexZeroBased + 1;
  let out = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

export function findHeaderRow(values, requiredAliases = []) {
  let best = { rowIndex: -1, score: -1 };
  const normalizedAliases = requiredAliases.map((group) => group.map(normalizeHeader));
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 30); rowIndex += 1) {
    const row = values[rowIndex] ?? [];
    const normalized = row.map(normalizeHeader);
    const textCount = normalized.filter(Boolean).length;
    const aliasScore = normalizedAliases.reduce(
      (sum, group) => sum + (group.some((alias) => normalized.includes(alias)) ? 5 : 0),
      0,
    );
    const score = textCount + aliasScore;
    if (score > best.score) best = { rowIndex, score };
  }
  return best.rowIndex;
}

export function mapHeaderColumns(headerRow, schemaAliases) {
  const normalized = headerRow.map(normalizeHeader);
  const out = {};
  for (const [semantic, aliases] of Object.entries(schemaAliases)) {
    const candidates = aliases.map(normalizeHeader);
    out[semantic] = normalized.findIndex((header) => candidates.includes(header));
  }
  return out;
}

export function findDataEnd(values, headerRowIndex, keyColumnIndex) {
  let last = headerRowIndex;
  let blankRun = 0;
  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const key = values[rowIndex]?.[keyColumnIndex];
    if (key == null || String(key).trim() === "") {
      blankRun += 1;
      if (blankRun >= 2) break;
    } else {
      blankRun = 0;
      last = rowIndex;
    }
  }
  return last;
}

export function addDiagnosticSheet(workbook, {
  title,
  subtitle,
  summaryCards,
  issues,
  questions,
  palette,
}) {
  const sheet = workbook.worksheets.add("🌻診断結果");
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(5);
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:H1").format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF", fontSize: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  sheet.getRange("A1:H1").format.rowHeight = 30;
  sheet.getRange("A2:H2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2:H2").format = {
    fill: palette.light,
    font: { color: palette.text, fontSize: 10 },
    wrapText: true,
  };
  sheet.getRange("A2:H2").format.rowHeight = 30;

  const cards = summaryCards.slice(0, 4);
  const cardMatrix = [cards.map((item) => item.label), cards.map((item) => item.value)];
  sheet.getRangeByIndexes(3, 0, 2, cards.length).values = cardMatrix;
  sheet.getRangeByIndexes(3, 0, 1, cards.length).format = {
    fill: palette.mid,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  sheet.getRangeByIndexes(4, 0, 1, cards.length).format = {
    fill: "#FFFFFF",
    font: { bold: true, color: palette.dark, fontSize: 14 },
    horizontalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: palette.border },
  };

  const issueStart = 7;
  sheet.getRange(`A${issueStart}:H${issueStart}`).values = [[
    "区分", "シート", "セル/行", "検出内容", "自動対応", "根拠", "影響", "状態",
  ]];
  if (issues.length) {
    sheet.getRangeByIndexes(issueStart, 0, issues.length, 8).values = issues.map((issue) => [
      issue.kind,
      issue.sheet,
      issue.location,
      issue.message,
      issue.action,
      issue.evidence,
      issue.impact,
      issue.status,
    ]);
  }
  const issueHeader = sheet.getRange(`A${issueStart}:H${issueStart}`);
  issueHeader.format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    wrapText: true,
  };
  const issueEnd = Math.max(issueStart + issues.length, issueStart + 1);
  sheet.getRange(`A${issueStart + 1}:H${issueEnd}`).format = {
    font: { color: "#1F2937", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "top",
    borders: {
      insideHorizontal: { style: "thin", color: "#E5E7EB" },
      bottom: { style: "thin", color: palette.border },
    },
  };
  sheet.getRange(`A${issueStart + 1}:A${issueEnd}`).conditionalFormats.add("containsText", {
    text: "HITL",
    format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });
  sheet.getRange(`H${issueStart + 1}:H${issueEnd}`).conditionalFormats.add("containsText", {
    text: "修正済",
    format: { fill: "#DCFCE7", font: { color: "#166534" } },
  });

  const questionStart = issueEnd + 3;
  sheet.getRange(`A${questionStart}:H${questionStart}`).merge();
  sheet.getRange(`A${questionStart}`).values = [["🌻 翌朝に確認する2点"]];
  sheet.getRange(`A${questionStart}:H${questionStart}`).format = {
    fill: "#F59E0B",
    font: { bold: true, color: "#FFFFFF", fontSize: 12 },
  };
  const questionRows = [];
  questions.forEach((question, index) => {
    questionRows.push([
      `質問${index + 1}`,
      question.question,
      question.reason,
      question.impact,
      question.options.map((option) => typeof option === "string" ? option : option.label).join(" / "),
      question.recommended ?? question.options.find((option) => (
        typeof option === "object" && option.optionId === question.recommendedOptionId
      ))?.label ?? "",
      "",
      "回答待ち",
    ]);
  });
  sheet.getRangeByIndexes(questionStart, 0, questionRows.length, 8).values = questionRows;
  sheet.getRangeByIndexes(questionStart, 0, questionRows.length, 8).format = {
    fill: "#FFFBEB",
    font: { color: "#78350F" },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "outside", style: "thin", color: "#FCD34D" },
  };

  const widths = [11, 16, 15, 34, 26, 34, 12, 12];
  widths.forEach((width, index) => {
    sheet.getRange(`${columnLetter(index)}:${columnLetter(index)}`).format.columnWidth = width;
  });
  sheet.getRange(`A${issueStart}:H${questionStart + questionRows.length}`).format.autofitRows();
  return sheet;
}

export const PALETTES = {
  purple: { dark: "#4C1D95", mid: "#7E22CE", light: "#F3E8FF", text: "#581C87", border: "#C4B5FD" },
  blue: { dark: "#1E3A8A", mid: "#1D4ED8", light: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
};

export function normalizeDecisions(raw) {
  const answers = Array.isArray(raw) ? raw : Array.isArray(raw?.answers) ? raw.answers : [];
  const out = new Map();
  for (const answer of answers) {
    const questionId = String(answer?.question_id ?? answer?.questionId ?? "").trim();
    if (!questionId) continue;
    out.set(questionId, {
      optionId: String(answer?.option_id ?? answer?.optionId ?? "").trim(),
      optionLabel: String(answer?.option_label ?? answer?.optionLabel ?? "").trim(),
      comment: safeText(answer?.comment ?? "", 1000),
    });
  }
  return out;
}

export function addFinalAnswerSheet(workbook, answers, appliedRows, palette = PALETTES.blue) {
  const existing = workbook.worksheets.items.find((sheet) => sheet.name === "🌻最終回答");
  if (existing) throw new Error("🌻最終回答 sheet already exists; resume from the preliminary workbook instead.");
  const sheet = workbook.worksheets.add("🌻最終回答");
  sheet.showGridLines = false;
  sheet.getRange("A1:E1").merge();
  sheet.getRange("A1").values = [["🌻 HITL回答の反映結果"]];
  sheet.getRange("A1:E1").format = {
    fill: palette.dark,
    font: { bold: true, color: "#FFFFFF", fontSize: 16 },
  };
  sheet.getRange("A2:E2").merge();
  sheet.getRange("A2").values = [["回答内容を監査可能な形で残しています。原本は変更していません。"]];
  sheet.getRange("A2:E2").format = { fill: palette.light, font: { color: palette.text }, wrapText: true };
  const rows = [...answers.entries()].map(([questionId, answer]) => [
    questionId,
    answer.optionId,
    answer.optionLabel,
    answer.comment,
    appliedRows[questionId] ?? "記録のみ",
  ]);
  sheet.getRange("A4:E4").values = [["質問ID", "選択ID", "回答", "コメント", "反映内容"]];
  if (rows.length) sheet.getRangeByIndexes(4, 0, rows.length, 5).values = rows;
  const end = Math.max(5, 4 + rows.length);
  sheet.getRange("A4:E4").format = {
    fill: palette.mid,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
  };
  sheet.getRange(`A5:E${end}`).format = {
    wrapText: true,
    verticalAlignment: "top",
    borders: { insideHorizontal: { style: "thin", color: "#E5E7EB" } },
  };
  [22, 20, 26, 36, 34].forEach((width, index) => {
    sheet.getRange(`${columnLetter(index)}:${columnLetter(index)}`).format.columnWidth = width;
  });
  sheet.getRange(`A1:E${end}`).format.autofitRows();
  return sheet;
}
