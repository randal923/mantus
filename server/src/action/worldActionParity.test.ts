import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARRIED_WATCH_ITEM_IDS, MAP_CLOCK_ITEM_IDS } from "./clockItemIds";
import { LEVER_TOGGLE_PAIRS } from "./leverTogglePairs";
import { loadChestDefinitions } from "./loadChestDefinitions";
import {
  PRESSURE_PLATE_DEPRESS,
  PRESSURE_PLATE_RELEASE,
  TRAP_RELEASE,
  TRAP_TILES,
} from "./pressurePlateTables";
import { SHOVEL_HOLE_PAIRS } from "./shovelHolePairs";
import { getToolDefinition, type ToolKind } from "../item/getToolDefinition";

interface ParityRegistration {
  readonly sourcePath: string;
  readonly kind: string;
  readonly status: string;
  readonly owner: string;
  readonly reason: string;
}

interface ParityReport {
  readonly formatVersion: number;
  readonly source: { readonly commit: string };
  readonly counts: {
    readonly registrations: number;
    readonly implemented: number;
    readonly deferred: number;
    readonly excluded: number;
    readonly unclassified: number;
  };
  readonly implementedItemIds: Readonly<Record<string, ReadonlyArray<number>>>;
  readonly implementedChestUidRanges: ReadonlyArray<readonly [number, number]>;
  readonly registrations: ReadonlyArray<ParityRegistration>;
}

const report: ParityReport = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../content/canary-world-action-parity.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as ParityReport;

const sorted = (ids: Iterable<number>) =>
  [...new Set(ids)].sort((left, right) => left - right);

const toolIdsOfKind = (kind: ToolKind): number[] =>
  sorted(
    report.implementedItemIds[kind]?.filter(
      (id) => getToolDefinition(id)?.kind === kind,
    ) ?? [],
  );

describe("Canary world-action parity report", () => {
  it("classifies every registration, leaving none silently dropped", () => {
    const unclassified = report.registrations.filter(
      (entry) => entry.status === "unclassified",
    );
    expect(
      unclassified.map((entry) => `${entry.sourcePath} (${entry.kind})`),
    ).toEqual([]);
    expect(report.counts.unclassified).toBe(0);
    expect(report.counts.registrations).toBe(report.registrations.length);
    expect(
      report.counts.implemented +
        report.counts.deferred +
        report.counts.excluded,
    ).toBe(report.counts.registrations);
  });

  it("states an owner and a reason for every entry", () => {
    for (const entry of report.registrations) {
      expect(entry.owner.length, entry.sourcePath).toBeGreaterThan(0);
      expect(entry.reason.length, entry.sourcePath).toBeGreaterThan(0);
      expect(["implemented", "deferred", "excluded"]).toContain(entry.status);
    }
  });

  it("covers the whole registration surface it claims to", () => {
    // Every tree todo-13 owns must have contributed entries; an empty tree
    // would silently understate the gap.
    for (const prefix of [
      "data/scripts/actions/",
      "data/scripts/movements/",
      "data/scripts/creaturescripts/",
      "data-otservbr-global/scripts/actions/",
    ]) {
      expect(
        report.registrations.some((entry) =>
          entry.sourcePath.startsWith(prefix),
        ),
        prefix,
      ).toBe(true);
    }
  });

  it("agrees with the server's live tool table", () => {
    for (const kind of [
      "rope",
      "shovel",
      "machete",
      "scythe",
      "pick",
      "crowbar",
      "fishing-rod",
    ] as const) {
      expect(sorted(report.implementedItemIds[kind] ?? []), kind).toEqual(
        toolIdsOfKind(kind),
      );
    }
  });

  it("agrees with the server's live clock, lever, plate, and trap tables", () => {
    expect(report.implementedItemIds.clock).toEqual(
      sorted([...MAP_CLOCK_ITEM_IDS, ...CARRIED_WATCH_ITEM_IDS]),
    );
    expect(report.implementedItemIds.lever).toEqual(
      sorted(LEVER_TOGGLE_PAIRS.keys()),
    );
    expect(report.implementedItemIds["pressure-plate"]).toEqual(
      sorted([...PRESSURE_PLATE_DEPRESS.keys(), ...PRESSURE_PLATE_RELEASE.keys()]),
    );
    expect(report.implementedItemIds.trap).toEqual(
      sorted([
        ...TRAP_TILES.keys(),
        ...TRAP_RELEASE.keys(),
        ...[...TRAP_TILES.values()].flatMap((trap) =>
          trap.transformTo === undefined ? [] : [trap.transformTo],
        ),
      ]),
    );
  });

  it("only claims chest uid ranges the imported chest table actually fills", () => {
    const chests = loadChestDefinitions("otservbr");
    expect(chests.size).toBeGreaterThan(0);
    // Chests outside the ChestUnique uid ranges come from the generated
    // quest_system1/2 table, whose ids are the map items' own storage uids.
    const questChests = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../data/quest-chests.json", import.meta.url)),
        "utf8",
      ),
    ) as { chests: Array<{ uniqueId: number }> };
    const questChestUids = new Set(
      questChests.chests.map((chest) => chest.uniqueId),
    );
    for (const chest of chests.values()) {
      expect(
        questChestUids.has(chest.uniqueId) ||
          report.implementedChestUidRanges.some(
            ([from, to]) => chest.uniqueId >= from && chest.uniqueId <= to,
          ),
        `chest ${chest.uniqueId}`,
      ).toBe(true);
    }
  });

  it("keeps the shovel hole pairs the parity report assumes", () => {
    // The shovel's diggable piles are content, not ids Canary registers an
    // action for, so they are asserted here rather than in the report.
    expect(sorted(SHOVEL_HOLE_PAIRS.keys())).toEqual([593, 606, 608]);
  });
});
