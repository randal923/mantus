import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(
  new URL("./setCharacterLevel.mjs", import.meta.url),
);

test("projects the exact experience boundary for a requested level", () => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "Test Hero", "50", "--dry-run"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /level 50 with 1847300 experience/);
});

test("rejects invalid character names and levels before opening the database", () => {
  const invalidName = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "../Hero", "50"],
    { encoding: "utf8" },
  );
  const invalidLevel = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "Test Hero", "1001"],
    { encoding: "utf8" },
  );

  assert.equal(invalidName.status, 1);
  assert.match(invalidName.stderr, /character name is invalid/);
  assert.equal(invalidLevel.status, 1);
  assert.match(invalidLevel.stderr, /level must be an integer from 1 to 1000/);
});
