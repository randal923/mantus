import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(new URL("./grantCoins.mjs", import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
  });
}

test("projects both currencies for the requested character", () => {
  const result = run("Test Hero", "--mantus", "500", "--gold", "1000", "--key", "grant-1", "--dry-run");

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /Would grant "Test Hero" 500 Mantus Coins and 1000 gold under key grant-1\./,
  );
});

test("either currency alone is a valid grant", () => {
  const mantusOnly = run("Test Hero", "--mantus", "10", "--dry-run");
  const goldOnly = run("Test Hero", "--gold", "10", "--dry-run");

  assert.equal(mantusOnly.status, 0);
  assert.match(mantusOnly.stdout, /10 Mantus Coins and 0 gold/);
  assert.equal(goldOnly.status, 0);
  assert.match(goldOnly.stdout, /0 Mantus Coins and 10 gold/);
});

test("rejects invalid input before opening the database", () => {
  const cases = [
    { args: ["../Hero", "--mantus", "5"], expected: /character name is invalid/ },
    { args: ["Test Hero"], expected: /nothing to grant/ },
    { args: ["Test Hero", "--mantus", "0"], expected: /--mantus must be an integer/ },
    { args: ["Test Hero", "--gold", "1.5"], expected: /--gold must be an integer/ },
    { args: ["Test Hero", "--mantus", "1e30"], expected: /--mantus must be an integer/ },
    { args: ["Test Hero", "--mantus", "5", "--key", "bad key!"], expected: /--key must be/ },
    { args: ["Test Hero", "--wipe"], expected: /usage: yarn coins:grant/ },
    { args: ["Test Hero", "--mantus"], expected: /usage: yarn coins:grant/ },
  ];

  for (const { args, expected } of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, `expected failure for ${args.join(" ")}`);
    assert.match(result.stderr, expected);
  }
});
