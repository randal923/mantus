import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(
  new URL("./grantImbuementMaterials.mjs", import.meta.url),
);

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });
}

test("projects the material list without touching the database", () => {
  const result = run("Test Hero", "--dry-run");

  assert.equal(result.status, 0);
  const projected = /up to 500 of each of (\d+) imbuement materials\./.exec(
    result.stdout,
  );
  assert.ok(projected, result.stdout);
  // Every astral source in the catalog plus the blank imbuement scroll.
  assert.ok(Number(projected[1]) > 50, result.stdout);
});

test("honours an explicit count", () => {
  const result = run("Test Hero", "--count", "25", "--dry-run");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Would top "Test Hero" up to 25 of each/);
});

test("rejects invalid input before opening the database", () => {
  const cases = [
    { args: ["../Hero", "--dry-run"], expected: /character name is invalid/ },
    { args: [], expected: /usage: yarn imbuement:grant-materials/ },
    { args: ["Test Hero", "--wipe"], expected: /usage: yarn imbuement/ },
    { args: ["Test Hero", "--count"], expected: /usage: yarn imbuement/ },
    { args: ["Test Hero", "--count", "0"], expected: /--count must be/ },
    { args: ["Test Hero", "--count", "1.5"], expected: /--count must be/ },
    { args: ["Test Hero", "--count", "1e30"], expected: /--count must be/ },
  ];

  for (const { args, expected } of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, `expected failure for ${args.join(" ")}`);
    assert.match(result.stderr, expected);
  }
});

test("requires a database url for a real grant", () => {
  const result = run("Test Hero");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL is not set/);
});
