import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildSpellReport } from "./buildSpellReport.mjs";

const catalog = JSON.parse(
  readFileSync(
    join(resolve(import.meta.dirname, ".."), "content/spells/canary-spells.json"),
    "utf8",
  ),
);

/**
 * The committed report must be exactly what the committed entries produce.
 * This is the determinism check that does not need a Canary checkout: if the
 * report were hand-edited, or regenerated from different entries, it fails.
 */
test("the committed spell report is reproducible from its own entries", () => {
  assert.deepEqual(buildSpellReport(catalog.spells), catalog.report);
});

test("building the report twice produces byte-identical output", () => {
  assert.equal(
    JSON.stringify(buildSpellReport(catalog.spells)),
    JSON.stringify(buildSpellReport([...catalog.spells])),
  );
});

test("classifies non-content separately from registered definitions", () => {
  const report = buildSpellReport(catalog.spells);
  const nonContent = catalog.spells.filter(
    (spell) => spell.parity.status === "non-content",
  );

  assert.equal(report.nonContent, nonContent.length);
  assert.equal(report.registered + report.nonContent, report.total);
  assert.equal(report.supported + report.disabled.total, report.registered);
  assert.equal(
    report.disabled.spells + report.disabled.runes,
    report.disabled.total,
  );
  // Non-content never contributes a reason to the gated counts.
  for (const spell of nonContent) {
    for (const reason of spell.unsupportedReasons) {
      assert.equal(report.reasons[reason], undefined);
    }
  }
});
