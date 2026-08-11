import type { Position } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  ADVENTURERS_STONE_STORAGE_KEY,
  GUILD_EXIT_PORTALS,
} from "./adventurersStoneTables";
import { AdventurersGuildExitService } from "./AdventurersGuildExitService";

const CARLIN_TEMPLE: Position = { x: 32360, y: 31782, z: 7 };
const THAIS_TEMPLE: Position = { x: 32369, y: 32241, z: 7 };
const WORLD_TEMPLE: Position = { x: 32069, y: 31901, z: 6 };
const PORTAL = GUILD_EXIT_PORTALS[0]!;

const harness = (options: {
  position: Position;
  storedTownId?: number;
  homeTownId?: number;
  teleportFails?: boolean;
}) => {
  const storage = new Map<string, number>();
  if (options.storedTownId !== undefined) {
    storage.set(ADVENTURERS_STONE_STORAGE_KEY, options.storedTownId);
  }
  const player = {
    position: options.position,
    townId: options.homeTownId ?? 8,
    storageValue: (key: string) => storage.get(key) ?? -1,
  } as unknown as Player;
  const effects: Array<{ position: Position; effectId: number }> = [];
  const setStorageValue = vi.fn(
    (_player: Player, key: string, value: number) => {
      storage.set(key, value);
    },
  );
  const teleport = vi.fn(
    (_session: Session, target: Player, destination: Position) => {
      if (options.teleportFails) return false;
      (target as { position: Position }).position = { ...destination };
      return true;
    },
  );
  const service = new AdventurersGuildExitService({
    teleport,
    effect: (position, effectId) => effects.push({ position, effectId }),
    setStorageValue,
    fallbackTemple: () => WORLD_TEMPLE,
  });
  const session = {} as unknown as Session;
  return { service, session, player, effects, teleport, setStorageValue };
};

describe("AdventurersGuildExitService", () => {
  it("ignores steps onto any other tile", () => {
    const h = harness({ position: { x: 32210, y: 32300, z: 6 } });
    expect(h.service.onStepIn(h.session, h.player)).toBe(false);
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("returns the player to the temple they came from and forgets it", () => {
    const h = harness({ position: PORTAL, storedTownId: 6 });
    expect(h.service.onStepIn(h.session, h.player)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      h.session,
      h.player,
      CARLIN_TEMPLE,
    );
    expect(h.setStorageValue).toHaveBeenCalledWith(
      h.player,
      ADVENTURERS_STONE_STORAGE_KEY,
      -1,
    );
    expect(h.effects).toEqual([
      { position: PORTAL, effectId: 11 },
      { position: CARLIN_TEMPLE, effectId: 11 },
    ]);
  });

  it("falls back to the player's own town when nothing was stored", () => {
    const h = harness({ position: PORTAL, homeTownId: 8 });
    expect(h.service.onStepIn(h.session, h.player)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(h.session, h.player, THAIS_TEMPLE);
  });

  it("falls back to the world temple for a town with no temple", () => {
    const h = harness({ position: PORTAL, homeTownId: 4_242 });
    expect(h.service.onStepIn(h.session, h.player)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(h.session, h.player, WORLD_TEMPLE);
  });

  it("keeps the stored town when no free tile was found", () => {
    const h = harness({
      position: PORTAL,
      storedTownId: 6,
      teleportFails: true,
    });
    expect(h.service.onStepIn(h.session, h.player)).toBe(false);
    expect(h.setStorageValue).not.toHaveBeenCalled();
    expect(h.effects).toEqual([]);
  });

  it("covers both portal tiles", () => {
    for (const portal of GUILD_EXIT_PORTALS) {
      const h = harness({ position: portal, storedTownId: 6 });
      expect(h.service.onStepIn(h.session, h.player)).toBe(true);
    }
  });
});
