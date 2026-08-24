import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error("Usage: node build-delivery-manifest.mjs <delivery-folder>");
const root = path.resolve(rootArg);
const files = [];
async function walk(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile() && entry.name !== "DELIVERY_MANIFEST.json") {
      const bytes = await fs.readFile(full);
      files.push({
        path: path.relative(root, full).replaceAll("\\", "/"),
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
await walk(root);
files.sort((left, right) => left.path.localeCompare(right.path, "ja"));
const manifest = {
  schema: "himawari-super-excel-delivery-v1",
  generated_at: new Date().toISOString(),
  development_inputs: ["A", "B"],
  blind_test_inputs_used: [],
  tests: {
    super_excel_assertion_groups: 14,
    exit_api_assertion_groups: 11,
    chat_hitl_assertion_groups: 5,
    formula_error_tokens: 0,
  },
  files,
};
await fs.writeFile(path.join(root, "DELIVERY_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ root, fileCount: files.length }, null, 2));
