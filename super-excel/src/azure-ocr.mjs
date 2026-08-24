import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const API_VERSION = "2024-11-30";

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function imageFingerprint(filePath) {
  const bytes = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const pixels = await sharp(bytes).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = pixels[row * 9 + col];
      const right = pixels[row * 9 + col + 1];
      bits += left > right ? "1" : "0";
    }
  }
  const dhash = BigInt(`0b${bits}`).toString(16).padStart(16, "0");
  const metadata = await sharp(bytes).metadata();
  return { sha256, dhash, width: metadata.width, height: metadata.height, bytes: bytes.length };
}

export function hammingDistance(hexA, hexB) {
  let value = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

async function analyzeOne(filePath, endpoint, key) {
  const bytes = await fs.readFile(filePath);
  const url = new URL(
    "documentintelligence/documentModels/prebuilt-read:analyze",
    endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
  );
  url.searchParams.set("_overload", "analyzeDocument");
  url.searchParams.set("api-version", API_VERSION);
  url.searchParams.set("locale", "ja-JP");

  const submitted = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    body: JSON.stringify({ base64Source: bytes.toString("base64") }),
  });
  if (!submitted.ok) {
    throw new Error(`OCR submit failed (${submitted.status}): ${await submitted.text()}`);
  }
  const operationLocation = submitted.headers.get("operation-location");
  if (!operationLocation) throw new Error("OCR response omitted Operation-Location");

  for (let attempt = 0; attempt < 45; attempt += 1) {
    await sleep(900);
    const polled = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (!polled.ok) throw new Error(`OCR poll failed (${polled.status})`);
    const result = await polled.json();
    if (result.status === "succeeded") {
      const pages = result.analyzeResult?.pages ?? [];
      const words = pages.flatMap((page) =>
        (page.words ?? []).map((word) => ({
          content: word.content,
          confidence: word.confidence,
        })),
      );
      return {
        apiVersion: result.analyzeResult?.apiVersion ?? API_VERSION,
        modelId: result.analyzeResult?.modelId ?? "prebuilt-read",
        content: result.analyzeResult?.content ?? "",
        words,
      };
    }
    if (result.status === "failed") {
      throw new Error(`OCR analysis failed: ${JSON.stringify(result.error ?? result)}`);
    }
  }
  throw new Error("OCR polling timed out");
}

export async function analyzeImages({ files, outputPath, endpoint, key }) {
  if (!endpoint || !key) throw new Error("Azure Document Intelligence credentials are required");
  const records = [];
  for (const filePath of files) {
    const fingerprint = await imageFingerprint(filePath);
    const ocr = await analyzeOne(filePath, endpoint, key);
    records.push({ file: filePath, fingerprint, ocr });
  }

  for (let i = 0; i < records.length; i += 1) {
    records[i].nearDuplicates = [];
    for (let j = 0; j < records.length; j += 1) {
      if (i === j) continue;
      const distance = hammingDistance(records[i].fingerprint.dhash, records[j].fingerprint.dhash);
      if (distance <= 8) {
        records[i].nearDuplicates.push({ file: records[j].file, hammingDistance: distance });
      }
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`);
  return records;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputPath, ...files] = process.argv.slice(2);
  const records = await analyzeImages({
    files,
    outputPath,
    endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  });
  console.log(JSON.stringify({ ok: true, files: records.length, outputPath }));
}
