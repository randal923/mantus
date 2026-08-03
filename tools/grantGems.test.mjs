import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(new URL("./grantGems.mjs", import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
  });
}

// Startup parses WHEEL_BASE_VOCATION and GEM_VOCATION_NAMES from the protocol
// source, so a passing dry-run also proves the pinned records still resolve.
test("projects the top-up for the requested character", () => {
  const result = run("Test Hero", "--count", "1000", "--dry-run");

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /Would top "Test Hero" up to 1000 of each unrevealed gem quality \(lesser\/regular\/greater\)\./,
  );
});

test("defaults to 1000 of each quality", () => {
  const result = run("Test Hero", "--dry-run");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /up to 1000 of each/);
});

test("rejects invalid input before opening the database", () => {
  const cases = [
    { args: [], expected: /usage: yarn gems:grant/ },
    { args: ["../Hero", "--dry-run"], expected: /character name is invalid/ },
    { args: ["Hero!", "--dry-run"], expected: /character name is invalid/ },
    { args: ["Test Hero", "--count", "0"], expected: /--count must be an integer/ },
    { args: ["Test Hero", "--count", "1.5"], expected: /--count must be an integer/ },
    { args: ["Test Hero", "--count", "2000000"], expected: /--count must be an integer/ },
    { args: ["Test Hero", "--count"], expected: /usage: yarn gems:grant/ },
    { args: ["Test Hero", "--wipe"], expected: /usage: yarn gems:grant/ },
  ];

  for (const { args, expected } of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, `expected failure for ${args.join(" ")}`);
    assert.match(result.stderr, expected);
  }
});
