import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUILD_EXIT_PORTALS } from "./adventurersStoneTables";
import { positionKey } from "../positionKey";
import { QUEST_TELEPORTS } from "./questTeleportTables";
import { readMapWalkability } from "../readMapWalkability";

// Every script-driven portal in QUEST_TELEPORTS is checked against the map the
// server actually loads: a portal whose tile nobody can stand on never fires,
// and one whose destination is not walkable is silently swallowed by
// `MovementHandler.teleportPlayer`, leaving the player standing on the portal.
// Both mistakes look exactly like the bug this table exists to fix, so they are
// caught here instead of in-game.

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");

const tileAt = readMapWalkability(join(dataDir, "otservbr.map.bin"));
const map = JSON.parse(
  readFileSync(join(dataDir, "otservbr.map.json"), "utf8"),
) as { transitions: Array<{ source: { x: number; y: number; z: number } }> };

/** `positionKey` is "z:x,y". */
const parseKey = (key: string) => {
  const [floor, plane] = key.split(":");
  const [x, y] = plane!.split(",").map(Number);
  return { x: x!, y: y!, z: Number(floor) };
};

describe("QUEST_TELEPORTS", () => {
  it("stands on tiles a player can reach", () => {
    const unreachable = [...QUEST_TELEPORTS.keys()].filter(
      (key) => tileAt(parseKey(key)) !== "walkable",
    );
    expect(unreachable).toEqual([]);
  });

  it("lands the player on a walkable tile", () => {
    const blocked = [...QUEST_TELEPORTS.entries()]
      .filter(([, definition]) => tileAt(definition.destination) !== "walkable")
      .map(([key]) => key);
    expect(blocked).toEqual([]);
  });

  it("never duplicates a transition the map already applies", () => {
    const mapTeleports = new Set(
      map.transitions.map((transition) => positionKey(transition.source)),
    );
    const overlap = [...QUEST_TELEPORTS.keys()].filter((key) =>
      mapTeleports.has(key),
    );
    expect(overlap).toEqual([]);
  });

  it("leaves the guild exit portals to the dynamic handler", () => {
    for (const portal of GUILD_EXIT_PORTALS) {
      expect(tileAt(portal)).toBe("walkable");
      expect(QUEST_TELEPORTS.has(positionKey(portal))).toBe(false);
    }
  });
});
