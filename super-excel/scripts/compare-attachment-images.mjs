import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { extractEmbeddedImages, isImagePath } from "../src/extract-images.mjs";
import { hammingDistance, imageFingerprint } from "../src/azure-ocr.mjs";
import { writeJson } from "../src/common.mjs";

function readArguments(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  return out;
}

async function listImages(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && isImagePath(entry.name)).map((entry) => path.join(folder, entry.name)).sort();
}

const options = readArguments(process.argv.slice(2));
if (!options.workbook || !options.attachments || !options.output) {
  throw new Error("使い方: node compare-attachment-images.mjs --workbook <xlsx> --attachments <folder> --output <json>");
}

const outputPath = path.resolve(options.output);
const scratch = path.join(path.dirname(outputPath), "embedded-images");
const embedded = await extractEmbeddedImages(path.resolve(options.workbook), scratch);
const attachments = await listImages(path.resolve(options.attachments));
const embeddedFingerprints = await Promise.all(embedded.map(async (file) => ({file, ...(await imageFingerprint(file))})));
const attachmentFingerprints = await Promise.all(attachments.map(async (file) => ({file, ...(await imageFingerprint(file))})));
const comparisons = attachmentFingerprints.map((attachment) => {
  const candidates = embeddedFingerprints.map((item) => ({
    embedded_file: path.basename(item.file),
    exact_sha256: item.sha256 === attachment.sha256,
    hamming_distance: hammingDistance(item.dhash, attachment.dhash),
  })).sort((left, right) => left.hamming_distance - right.hamming_distance);
  return {
    attachment_file: path.basename(attachment.file),
    sha256: attachment.sha256,
    dhash: attachment.dhash,
    closest_embedded: candidates.slice(0, 3),
    near_duplicate_count: candidates.filter((item) => item.exact_sha256 || item.hamming_distance <= 8).length,
  };
});

await writeJson(outputPath, {
  workbook: path.resolve(options.workbook),
  embedded_image_count: embedded.length,
  attachment_image_count: attachments.length,
  comparisons,
});
process.stdout.write(`${JSON.stringify({output:outputPath,embedded:embedded.length,attachments:attachments.length}, null, 2)}\n`);
