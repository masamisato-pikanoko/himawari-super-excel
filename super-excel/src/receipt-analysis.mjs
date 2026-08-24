import fs from "node:fs/promises";
import path from "node:path";

function normalizeOcr(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[·・|'“”"`]/g, "")
    .toUpperCase();
}

function parseReceipt(content) {
  const normalized = normalizeOcr(content);
  const dateMatch = normalized.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/);
  const idMatch = normalized.match(/R-?\d{3}/);
  const authMatch = normalized.match(/AUTH(\d{4,})/);
  const moneyMatches = [...normalized.matchAll(/[¥￥]([\d,]+)/g)]
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter(Number.isFinite);
  return {
    date: dateMatch ? dateMatch[0].replace(/[/.]/g, "-") : "",
    receiptId: idMatch ? idMatch[0].replace(/^R(?=\d)/, "R-") : "",
    auth: authMatch ? authMatch[1] : "",
    totalYen: moneyMatches.length ? Math.max(...moneyMatches) : null,
    normalizedText: normalized,
  };
}

function similarity(left, right) {
  const a = new Set(left.match(/[A-Z]+|\d+|[一-龠ぁ-んァ-ンー]+/g) ?? []);
  const b = new Set(right.match(/[A-Z]+|\d+|[一-龠ぁ-んァ-ンー]+/g) ?? []);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size);
}

function hammingDistance(hexA, hexB) {
  if (!/^[a-f0-9]{16}$/i.test(String(hexA ?? "")) || !/^[a-f0-9]{16}$/i.test(String(hexB ?? ""))) return Infinity;
  let value = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export async function loadReceiptAnalysis(ocrJsonPath) {
  const raw = JSON.parse(await fs.readFile(ocrJsonPath, "utf8"));
  const receipts = raw.records.map((record) => ({
    file: path.basename(record.file),
    sourcePath: record.file,
    ...record.fingerprint,
    ...parseReceipt(record.ocr?.content),
    ocrText: record.ocr?.content ?? "",
    ocrWords: record.ocr?.words ?? [],
  }));

  for (let i = 0; i < receipts.length; i += 1) {
    receipts[i].duplicateCandidates = [];
    for (let j = 0; j < receipts.length; j += 1) {
      if (i === j) continue;
      const other = receipts[j];
      const sameBusinessKey = Boolean(
        (receipts[i].receiptId && receipts[i].receiptId === other.receiptId)
        || (receipts[i].auth && receipts[i].auth === other.auth),
      );
      const textSimilarity = similarity(receipts[i].normalizedText, other.normalizedText);
      const visualDistance = hammingDistance(receipts[i].dhash, other.dhash);
      const visualNearDuplicate = visualDistance <= 8;
      const partialSame = Boolean(
        receipts[i].date && receipts[i].date === other.date
        && receipts[i].totalYen != null && receipts[i].totalYen === other.totalYen,
      );
      if (sameBusinessKey || partialSame || textSimilarity >= 0.72 || visualNearDuplicate) {
        receipts[i].duplicateCandidates.push({
          file: other.file,
          sameBusinessKey,
          partialSame,
          textSimilarity: Number(textSimilarity.toFixed(3)),
          visualNearDuplicate,
          hammingDistance: Number.isFinite(visualDistance) ? visualDistance : null,
        });
      }
    }
  }
  return receipts;
}
