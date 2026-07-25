import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "../spawn/loadCreatureContent";

/**
 * Feature 39 — NPC import parity gate.
 *
 * The import report is the ledger of everything the NPC pipeline could not
 * turn into typed content. These pins make the gap counts monotonically
 * shrinking: a change that reintroduces a procedural gap, silently drops a
 * placement, or stops proving a travel destination fails here. Each count
 * tightens toward zero as Feature 38's command families land.
 */
const REPORT_PATH = fileURLToPath(
  new URL("../../../content/npcs/canary-npc-import-report.json", import.meta.url),
);

interface UnsupportedAction {
  readonly keywords: ReadonlyArray<string>;
  readonly action: string;
  readonly sourceInvalid?: string;
}

interface Report {
  readonly formatVersion: number;
  readonly source: { readonly canaryCommit: string; readonly definitionCount: number };
  readonly shops: {
    readonly sourceDefinitions: number;
    readonly catalogs: number;
    readonly declaredRows: number;
    readonly importedOffers: number;
    readonly unsupportedRows: number;
    readonly unsupportedCallbacks: number;
    readonly definitions: ReadonlyArray<{
      readonly typeId: string;
      readonly unsupportedRows: ReadonlyArray<{ readonly reason: string }>;
    }>;
  };
  readonly dialogues: {
    readonly sourceDefinitions: number;
    readonly interactiveDefinitions: number;
    readonly nonInteractiveDefinitions: number;
    readonly unsupportedKeywordActions: number;
    readonly unsupportedMessages: number;
    readonly proceduralCallbacks: number;
    readonly definitions: ReadonlyArray<{
      readonly typeId: string;
      readonly sourcePath: string;
      readonly unsupportedKeywordActions: ReadonlyArray<UnsupportedAction>;
    }>;
  };
  readonly destinations: {
    readonly checked: number;
    readonly unavailable: ReadonlyArray<unknown>;
  };
  readonly unselectedSources: ReadonlyArray<{ readonly classification: string }>;
}

const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Report;

/**
 * Ceilings, never floors. Lower them when a command family lands; a raise is
 * a regression and must fail review, not the test.
 */
const CEILINGS = {
  unsupportedKeywordActions: 611,
  unsupportedMessages: 21,
  proceduralCallbacks: 601,
  unsupportedShopRows: 3,
};

describe("NPC import parity gate", () => {
  it("keeps every gap count at or below its pinned ceiling", () => {
    expect(report.dialogues.unsupportedKeywordActions).toBeLessThanOrEqual(
      CEILINGS.unsupportedKeywordActions,
    );
    expect(report.dialogues.unsupportedMessages).toBeLessThanOrEqual(
      CEILINGS.unsupportedMessages,
    );
    expect(report.dialogues.proceduralCallbacks).toBeLessThanOrEqual(
      CEILINGS.proceduralCallbacks,
    );
    expect(report.shops.unsupportedRows).toBeLessThanOrEqual(
      CEILINGS.unsupportedShopRows,
    );
  });

  it("accounts for every pinned definition with no silent omissions", () => {
    expect(report.source.definitionCount).toBe(956);
    expect(report.dialogues.sourceDefinitions).toBe(956);
    expect(
      report.dialogues.interactiveDefinitions +
        report.dialogues.nonInteractiveDefinitions,
    ).toBe(956);
    expect(report.dialogues.definitions).toHaveLength(956);
    // Sources the pinned world never spawns are classified, not dropped.
    for (const source of report.unselectedSources) {
      expect(source.classification).toBe(
        "not-referenced-by-pinned-world-spawns",
      );
    }
  });

  it("proves every travel destination walkable at import time", () => {
    expect(report.destinations.unavailable).toEqual([]);
    expect(report.destinations.checked).toBeGreaterThan(0);
  });

  it("records source-invalid exclusions explicitly, never as omissions", () => {
    // Black Bert's three shop rows name item ids the pinned catalog lacks.
    const rows = report.shops.definitions.flatMap(
      (definition) => definition.unsupportedRows,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.reason).toBe("item is missing from the pinned item catalog");
    }
    // Spell offers naming a spell outside the pinned catalog are the same
    // shape of exclusion: reported with a reason, never silently omitted.
    const sourceInvalid = report.dialogues.definitions.flatMap((definition) =>
      definition.unsupportedKeywordActions.filter(
        (action) => action.sourceInvalid !== undefined,
      ),
    );
    expect(sourceInvalid.length).toBeGreaterThan(0);
    for (const action of sourceInvalid) {
      expect(action.sourceInvalid).toMatch(/is not in the pinned catalog$/);
    }
  });

  it("resolves every reported definition against the loaded content", () => {
    const content = loadCreatureContent("world", "otservbr");
    for (const definition of report.dialogues.definitions) {
      expect(
        content.npcTypes.has(definition.typeId),
        definition.typeId,
      ).toBe(true);
      // Every source stays inside the pinned NPC directory — one path
      // segment, no traversal. (One pinned file really is named "h.l..lua".)
      expect(definition.sourcePath).toMatch(
        /^data-otservbr-global\/npc\/[^/]+\.lua$/,
      );
    }
    // Every catalog belongs to exactly one loaded shopkeeper.
    const owners = report.shops.definitions.map(
      (definition) => definition.typeId,
    );
    expect(new Set(owners).size).toBe(owners.length);
  });
});
