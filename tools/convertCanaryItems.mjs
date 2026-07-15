import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseCanaryItemSemantics } from "./parseCanaryItemSemantics.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const input = args.find((argument) => !argument.startsWith("--"));
if (!input) {
  throw new Error(
    "usage: node tools/convertCanaryItems.mjs <items.xml> --commit=<sha>",
  );
}
const commit = args
  .find((argument) => argument.startsWith("--commit="))
  ?.slice("--commit=".length);
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
  throw new Error("--commit must be the full 40-character Canary commit SHA");
}
const output = resolve(
  args.find((argument) => argument.startsWith("--output="))?.slice(9) ??
    join(repoRoot, "content/canary-item-semantics.json"),
);
const source = await readFile(resolve(input));
const items = parseCanaryItemSemantics(source.toString("latin1"));
const converted = {
  formatVersion: 2,
  source: {
    canaryCommit: commit,
    sha256: createHash("sha256").update(source).digest("hex"),
  },
  items,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(converted)}\n`);
console.log(`converted ${Object.keys(items).length} item semantics to ${output}`);
