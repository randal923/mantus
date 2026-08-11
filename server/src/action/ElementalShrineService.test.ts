import type { Position } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  ELEMENTAL_SHRINE_DESTINATIONS,
  ELEMENTAL_SHRINE_MESSAGE,
  ELEMENTAL_SHRINE_STORAGE_KEY,
} from "./elementalShrineTables";
import { ElementalShrineService } from "./ElementalShrineService";

const THAIS_ICE_FLAME: Position = { x: 32358, y: 32242, z: 6 };
const ICE_SHRINE_EXIT: Position = { x: 32191, y: 31419, z: 2 };
const THAIS_RETURN: Position = { x: 32369, y: 32242, z: 6 };
const THAIS_TEMPLE: Position = { x: 32369, y: 32241, z: 7 };
const WORLD_TEMPLE: Position = { x: 32069, y: 31901, z: 6 };
const STREET: Position = { x: 32345, y: 32222, z: 7 };

const harness = (options: {
  position: Position;
  level?: number;
  storedCityIndex?: number;
  homeTownId?: number;
  teleportFails?: boolean;
}) => {
  const storage = new Map<string, number>();
  if (options.storedCityIndex !== undefined) {
    storage.set(ELEMENTAL_SHRINE_STORAGE_KEY, options.storedCityIndex);
  }
  const player = {
    position: options.position,
    level: options.level ?? 30,
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
  const session = { send: vi.fn() };
  const service = new ElementalShrineService({
    teleport,
    effect: (position, effectId) => effects.push({ position, effectId }),
    setStorageValue,
    fallbackTemple: () => WORLD_TEMPLE,
  });
  return { service, session, player, effects, teleport, setStorageValue };
};

const step = (h: ReturnType<typeof harness>, from: Position = STREET) =>
  h.service.onStepIn(h.session as unknown as Session, h.player, from);

describe("ElementalShrineService", () => {
  it("ignores tiles that are not shrine flames", () => {
    const h = harness({ position: STREET });
    expect(step(h)).toBe(false);
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("carries a level-30 character to their element's shrine", () => {
    const h = harness({ position: THAIS_ICE_FLAME, level: 30 });
    expect(step(h)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      ELEMENTAL_SHRINE_DESTINATIONS.ice,
    );
    expect(h.setStorageValue).toHaveBeenCalledWith(
      h.player,
      ELEMENTAL_SHRINE_STORAGE_KEY,
      2,
    );
    expect(h.effects).toEqual([]);
  });

  it("pushes a character below level 30 back where they came from", () => {
    const h = harness({ position: THAIS_ICE_FLAME, level: 29 });
    const from = { x: 32358, y: 32243, z: 6 };
    expect(step(h, from)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(expect.anything(), h.player, from);
    expect(h.setStorageValue).not.toHaveBeenCalled();
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: ELEMENTAL_SHRINE_MESSAGE,
    });
    expect(h.effects).toEqual([{ position: from, effectId: 11 }]);
  });

  it("returns a shrine visitor to the city they entered from", () => {
    const h = harness({ position: ICE_SHRINE_EXIT, storedCityIndex: 2 });
    expect(step(h)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      THAIS_RETURN,
    );
    expect(h.setStorageValue).not.toHaveBeenCalled();
    expect(h.effects).toEqual([{ position: THAIS_RETURN, effectId: 11 }]);
  });

  it("falls back to the home temple when no city was remembered", () => {
    const h = harness({ position: ICE_SHRINE_EXIT, homeTownId: 8 });
    expect(step(h)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      THAIS_TEMPLE,
    );
  });

  it("leaves the player alone when no free tile was found", () => {
    const h = harness({
      position: THAIS_ICE_FLAME,
      level: 60,
      teleportFails: true,
    });
    expect(step(h)).toBe(false);
    expect(h.setStorageValue).not.toHaveBeenCalled();
  });
});
