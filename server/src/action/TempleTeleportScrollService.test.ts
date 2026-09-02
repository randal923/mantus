import type { Position } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { TEMPLE_TELEPORT_SCROLL_TYPE_ID } from "../item/templeTeleportScrollTypeId";
import type { Player } from "../Player";
import type { Session } from "../Session";
import {
  TEMPLE_SCROLL_IN_FIGHT_MESSAGE,
  TempleTeleportScrollService,
} from "./TempleTeleportScrollService";

const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BACKPACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCROLL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const STREET: Position = { x: 32345, y: 32222, z: 7 };
const THAIS_TEMPLE: Position = { x: 32369, y: 32241, z: 7 };
const TELEPORT_EFFECT = 11;
const POFF_EFFECT = 3;

const scrollItem = (): Item => ({
  id: SCROLL_ID,
  typeId: TEMPLE_TELEPORT_SCROLL_TYPE_ID,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
});

const harness = (options: {
  combatLockMs?: number;
  pzLockMs?: number;
  teleportFails?: boolean;
  /** Fight state observed when the charge write commits. */
  combatLockMsOnCommit?: number;
}) => {
  const locks = new Map<string, number>([
    ["combat-lock", options.combatLockMs ?? 0],
    ["pz-lock", options.pzLockMs ?? 0],
  ]);
  const player = {
    id: CHARACTER_ID,
    position: { ...STREET },
    townId: 8,
    conditions: {
      remainingMs: (type: string) => locks.get(type) ?? 0,
    },
  } as unknown as Player;
  const session = {
    playerId: CHARACTER_ID,
    itemOperationPending: false,
    travelOperationPending: false,
    send: vi.fn(),
    sendError: vi.fn(),
  };
  let scroll: Item | undefined = scrollItem();
  const consumeCharges = vi.fn(
    (
      _session: Session,
      itemId: string,
      revision: number,
      count: number,
      onCommitted: (spent: number, now: number) => void,
    ) => {
      if (!scroll || scroll.id !== itemId || scroll.version !== revision) {
        return false;
      }
      scroll = undefined;
      if (options.combatLockMsOnCommit !== undefined) {
        locks.set("combat-lock", options.combatLockMsOnCommit);
      }
      onCommitted(count, 1_000);
      return true;
    },
  );
  const itemsHandler = {
    inventorySnapshot: () => ({ items: scroll ? [scroll] : [] }),
    consumeCharges,
  };
  const effects: Array<{ position: Position; effectId: number }> = [];
  const teleport = vi.fn(
    (_session: Session, target: Player, destination: Position) => {
      if (options.teleportFails) return false;
      (target as { position: Position }).position = { ...destination };
      return true;
    },
  );
  const service = new TempleTeleportScrollService(
    itemsHandler as unknown as ItemIntentHandler,
    {
      getPlayer: () => player,
      homeTemple: () => THAIS_TEMPLE,
      teleport,
      effect: (position, effectId) => effects.push({ position, effectId }),
    },
  );
  const use = (revision = 1) =>
    service.handleUseItem(
      session as unknown as Session,
      { type: "use-item", itemId: SCROLL_ID, revision },
      0,
    );
  return { service, session, player, effects, teleport, consumeCharges, use };
};

describe("TempleTeleportScrollService", () => {
  it("ignores intents for other items and stale revisions", () => {
    const h = harness({});
    expect(
      h.service.handleUseItem(
        h.session as unknown as Session,
        { type: "use-item", itemId: BACKPACK_ID, revision: 1 },
        0,
      ),
    ).toBe(false);
    expect(h.use(2)).toBe(false);
    expect(h.consumeCharges).not.toHaveBeenCalled();
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("spends the scroll and teleports to the home temple when not fighting", () => {
    const h = harness({});
    expect(h.use()).toBe(true);
    expect(h.consumeCharges).toHaveBeenCalledWith(
      expect.anything(),
      SCROLL_ID,
      1,
      1,
      expect.any(Function),
    );
    expect(h.teleport).toHaveBeenCalledWith(
      expect.anything(),
      h.player,
      THAIS_TEMPLE,
    );
    expect(h.effects).toEqual([
      { position: STREET, effectId: TELEPORT_EFFECT },
      { position: THAIS_TEMPLE, effectId: TELEPORT_EFFECT },
    ]);
    expect(h.session.sendError).not.toHaveBeenCalled();
  });

  it("refuses while combat-locked, keeping the scroll", () => {
    const h = harness({ combatLockMs: 30_000 });
    expect(h.use()).toBe(true);
    expect(h.consumeCharges).not.toHaveBeenCalled();
    expect(h.teleport).not.toHaveBeenCalled();
    expect(h.effects).toEqual([{ position: STREET, effectId: POFF_EFFECT }]);
    expect(h.session.send).toHaveBeenCalledWith({
      type: "combat-log",
      kind: "condition",
      text: TEMPLE_SCROLL_IN_FIGHT_MESSAGE,
    });
  });

  it("refuses while pz-locked, keeping the scroll", () => {
    const h = harness({ pzLockMs: 30_000 });
    expect(h.use()).toBe(true);
    expect(h.consumeCharges).not.toHaveBeenCalled();
    expect(h.teleport).not.toHaveBeenCalled();
  });

  it("does not teleport when a fight began while the charge was being written", () => {
    const h = harness({ combatLockMsOnCommit: 30_000 });
    expect(h.use()).toBe(true);
    expect(h.consumeCharges).toHaveBeenCalledTimes(1);
    expect(h.teleport).not.toHaveBeenCalled();
    expect(h.effects).toEqual([{ position: STREET, effectId: POFF_EFFECT }]);
  });

  it("uses one scroll for at most one trip", () => {
    const h = harness({});
    expect(h.use()).toBe(true);
    // The item is gone from the snapshot, so a replayed intent no longer
    // names a carried item.
    expect(h.use()).toBe(false);
    expect(h.teleport).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly while another item operation is pending", () => {
    const h = harness({});
    h.session.itemOperationPending = true;
    expect(h.use()).toBe(true);
    expect(h.consumeCharges).not.toHaveBeenCalled();
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
  });

  it("fails cleanly when no free tile exists at the temple", () => {
    const h = harness({ teleportFails: true });
    expect(h.use()).toBe(true);
    expect(h.effects).toEqual([]);
    expect(h.session.sendError).toHaveBeenCalledWith("item-action-failed");
  });
});
