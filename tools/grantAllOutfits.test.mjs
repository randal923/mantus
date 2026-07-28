import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(
  new URL("./grantAllOutfits.mjs", import.meta.url),
);

test("projects the whole catalog for the requested character", () => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "Test Hero", "--dry-run"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  const projected = /"Test Hero" (\d+) outfits with addons 3 and (\d+) mounts\./
    .exec(result.stdout);
  assert.ok(projected, result.stdout);
  assert.ok(Number(projected[1]) > 0);
  assert.ok(Number(projected[2]) > 0);
});

test("rejects invalid names and stray options before opening the database", () => {
  const invalidName = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "../Hero"],
    { encoding: "utf8" },
  );
  const strayOption = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "Test Hero", "--wipe"],
    { encoding: "utf8" },
  );

  assert.equal(invalidName.status, 1);
  assert.match(invalidName.stderr, /character name is invalid/);
  assert.equal(strayOption.status, 1);
  assert.match(strayOption.stderr, /usage: yarn character:grant-outfits/);
});
