import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [renderDirArg, outputPathArg] = process.argv.slice(2);
if (!renderDirArg || !outputPathArg) throw new Error("Usage: node make-contact-sheet.mjs <render-dir> <output.png>");
const renderDir = path.resolve(renderDirArg);
const outputPath = path.resolve(outputPathArg);
const names = (await fs.readdir(renderDir)).filter((name) => name.toLowerCase().endsWith(".png")).sort();
const tileWidth = 640;
const labelHeight = 42;
const gap = 20;
const tiles = [];
for (const name of names) {
  const image = sharp(path.join(renderDir, name));
  const metadata = await image.metadata();
  const height = Math.max(1, Math.round((metadata.height || 1) * tileWidth / (metadata.width || 1)));
  const resized = await image.resize({ width: tileWidth }).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="14" y="28" font-family="Segoe UI, sans-serif" font-size="20" fill="white">${name.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`);
  tiles.push({ name, width: metadata.width, height: metadata.height, resized, displayHeight: height, label });
}
const canvasHeight = tiles.reduce((sum, tile) => sum + labelHeight + tile.displayHeight + gap, gap);
let y = gap;
const composite = [];
for (const tile of tiles) {
  composite.push({ input: tile.label, left: gap, top: y });
  y += labelHeight;
  composite.push({ input: tile.resized, left: gap, top: y });
  y += tile.displayHeight + gap;
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp({
  create: { width: tileWidth + gap * 2, height: canvasHeight, channels: 4, background: "#F3F4F6" },
}).composite(composite).png().toFile(outputPath);
console.log(JSON.stringify({ outputPath, originals: tiles.map(({ name, width, height }) => ({ name, width, height })) }, null, 2));
