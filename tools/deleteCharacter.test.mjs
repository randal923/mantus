import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(
  new URL("./deleteCharacter.mjs", import.meta.url),
);

test("rejects invalid character names before opening the database", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "../Hero"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /character name is invalid/);
});

test("prints usage when no character name is given", () => {
  const missingName = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
  });
  const unknownOption = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "Test Hero", "--force"],
    { encoding: "utf8" },
  );

  assert.equal(missingName.status, 1);
  assert.match(missingName.stderr, /usage: yarn character:delete/);
  assert.equal(unknownOption.status, 1);
  assert.match(unknownOption.stderr, /usage: yarn character:delete/);
});
