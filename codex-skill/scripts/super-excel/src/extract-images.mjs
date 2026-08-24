import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);

export function isImagePath(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function extractEmbeddedImages(xlsxPath, outputDir) {
  const zip = await JSZip.loadAsync(await fs.readFile(xlsxPath));
  await fs.mkdir(outputDir, { recursive: true });
  const outputPaths = [];
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/^xl\/media\//i.test(entryName) || !isImagePath(entryName)) continue;
    const outputPath = path.join(outputDir, path.basename(entryName));
    await fs.writeFile(outputPath, await entry.async("nodebuffer"));
    outputPaths.push(outputPath);
  }
  return outputPaths.sort();
}

export async function findNearbyImages(xlsxPath) {
  const folder = path.dirname(xlsxPath);
  const candidates = [folder, path.join(folder, "attachments"), path.join(folder, "添付")];
  const found = [];
  for (const candidate of candidates) {
    try {
      const entries = await fs.readdir(candidate, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = path.join(candidate, entry.name);
        if (isImagePath(filePath)) found.push(filePath);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return [...new Set(found)].sort();
}
