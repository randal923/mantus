import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) return typescriptFiles(`${path}/`);
      if (!entry.name.endsWith(".ts")) return [];
      if (entry.name.endsWith(".test.ts")) return [];
      return [path];
    }),
  );
  return files.flat();
}

/**
 * Decay deadlines resume from `items.updated_at` after a restart
 * (`DecayManager.observeLoaded`). An `UPDATE items` that forgets to bump it
 * would leave a mutated item carrying its pre-mutation age, and the next boot
 * would decay it early — so every statement that writes an item row must set
 * it. Test fixtures are exempt; they backdate rows on purpose.
 */
describe("items.updated_at invariant", () => {
  it("every production UPDATE items statement sets updated_at", async () => {
    const files = await typescriptFiles(sourceRoot);
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (!/update\s+items\b/i.test(source)) continue;
      if (/updated_at/i.test(source)) continue;
      offenders.push(file.slice(sourceRoot.length));
    }
    expect(offenders).toEqual([]);
  });
});
