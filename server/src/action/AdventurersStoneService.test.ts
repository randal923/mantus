import type { Position } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import { ADVENTURERS_STONE_TYPE_ID } from "../item/adventurersStoneTypeId";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  ADVENTURERS_STONE_STORAGE_KEY,
  GUILD_ARRIVAL,
} from "./adventurersStoneTables";
import { AdventurersStoneService } from "./AdventurersStoneService";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STONE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const THAIS_TEMPLE: Position = { x: 32369, y: 32241, z: 7 };
const CARLIN_TEMPLE: Position = { x: 32360, y: 31782, z: 7 };

const stoneItem = (): Item => ({
  id: STONE_ID,
  typeId: ADVENTURERS_STONE_TYPE_ID,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BOUND_ID, slot: 1 },
});

const harness = (options: {
  position: Position;
  storedTownId?: number;
  pzLocked?: boolean;
  protectionZone?: boolean;
  house?: boolean;
  teleportFails?: boolean;
}) => {
  const storage = new Map<string, number>();
  if (options.storedTownId !== undefined) {
    storage.set(ADVENTURERS_STONE_STORAGE_KEY, options.storedTownId);
  }
  const conditions = new Set<string>(options.pzLocked ? ["pz-lock"] : []);
  const player = {
    id: CHARACTER_ID,
    position: options.position,
    townId: 1,
    conditions,
    storageValue: (key: string) => storage.get(key) ?? -1,
  } as unknown as Player;
  const session = {
    playerId: CHARACTER_ID,
    itemOperationPending: false,
    travelOperationPending: false,
    send: vi.fn(),
    sendError: vi.fn(),
  };
  const itemsHandler = {
    inventorySnapshot: () => ({ items: [stoneItem()] }),
  };
  const effects: Array<{ position: Position; effectId: number }> = [];
  const setStorageValue = vi.fn((_player: Player, key: string, value: number) => {
    storage.set(key, value);
  });
  const teleport = vi.fn((_session: Session, target: Player, destination: Position) => {
    if (options.teleportFails) return false;
    (target as { position: Position }).position = { ...destination };
    return true;
  });
  const service = new AdventurersStoneService(
    itemsHandler as unknown as ItemIntentHandler,
    {
      getPlayer: () => player,
      isProtectionZone: () => options.protectionZone ?? true,
      isHouse: () => options.house ?? false,
      teleport,
      effect: (position, effectId) => effects.push({ position, effectId }),
      setStorageValue,
      fallbackTemple: () => ({ x: 32069, y: 31901, z: 6 }),
    },
  );
  return { service, session, player, effects, teleport, setStorageValue };
};

const useStone = (h: ReturnType<typeof harness>, revision = 1) =>
  h.service.handleUseItem(h.session as unknown as Session, {
    type: "use-item",
    itemId: STONE_ID,
    revision,
  });

describe("AdventurersStoneService", () => {
  it("ignores intents for other items and stale revisions", () => {
    const h = harness({ position: THAIS_TEMPLE });
    expect(
      h.service.handleUseItem(h.session as unknown as Session, {
        type: "use-item",
        itemId: BOUND_ID,
        revision: 1,
      }),
    ).toBe(false);
    expect(useStone(h, 2)).toBe(false);
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("teleports a temple visitor to the guild and stores the town", () => {
    const h = harness({ position: THAIS_TEMPLE });
    expect(useStone(h)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      GUILD_ARRIVAL,
    );
    expect(h.setStorageValue).toHaveBeenCalledWith(
      h.player,
      ADVENTURERS_STONE_STORAGE_KEY,
      8,
    );
    expect(h.effects).toEqual([
      { position: THAIS_TEMPLE, effectId: 11 },
      { position: GUILD_ARRIVAL, effectId: 11 },
    ]);
  });

  it("returns a guild visitor to the stored temple and clears the storage", () => {
    const h = harness({ position: GUILD_ARRIVAL, storedTownId: 6 });
    expect(useStone(h)).toBe(true);
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      CARLIN_TEMPLE,
    );
    expect(h.setStorageValue).toHaveBeenCalledWith(
      h.player,
      ADVENTURERS_STONE_STORAGE_KEY,
      -1,
    );
  });

  it("puffs and explains when used away from a temple", () => {
    const h = harness({ position: THAIS_TEMPLE, protectionZone: false });
    expect(useStone(h)).toBe(true);
    expect(h.teleport).not.toHaveBeenCalled();
    expect(h.effects).toEqual([{ position: THAIS_TEMPLE, effectId: 3 }]);
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: "Try to move more to the center of a temple to use the spiritual energy for a teleport.",
    });
  });

  it("refuses while pz-locked even inside the temple", () => {
    const h = harness({ position: THAIS_TEMPLE, pzLocked: true });
    expect(useStone(h)).toBe(true);
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("fails cleanly while another item operation is pending", () => {
    const h = harness({ position: THAIS_TEMPLE });
    h.session.itemOperationPending = true;
    expect(useStone(h)).toBe(true);
    expect(h.teleport).not.toHaveBeenCalled();
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
  });

  it("fails cleanly when no free tile exists at the destination", () => {
    const h = harness({ position: THAIS_TEMPLE, teleportFails: true });
    expect(useStone(h)).toBe(true);
    expect(h.setStorageValue).not.toHaveBeenCalled();
    expect(h.effects).toEqual([]);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
  });
});
