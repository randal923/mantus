import { describe, expect, it, vi } from "vitest";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { QuestService } from "./QuestService";
import type { QuestStorageAliases } from "./loadQuestStorageAliases";

const ALIASES: QuestStorageAliases = {
  canonicalOf: (key) =>
    key === "Quest.Alias.Old" ? "Quest.Canonical.New" : key,
  size: 1,
};

function harness() {
  const markDirty = vi.fn();
  const persistence = { markDirty } as unknown as CharacterPersistence;
  const player = new Player(makeCharacter("hero"), { x: 0, y: 0, z: 7 }, 0);
  const changes: Array<{ key: string; value: number }> = [];
  const service = new QuestService(persistence, ALIASES);
  service.setOnStorageChanged((_player, key, value) => {
    changes.push({ key, value });
  });
  return { service, player, markDirty, changes };
}

describe("QuestService", () => {
  it("round-trips bounded values and erases on -1 like Canary", () => {
    const { service, player, markDirty } = harness();
    service.setStorageValue(player, "Quest.Example.Line", 3);
    expect(service.storageValue(player, "Quest.Example.Line")).toBe(3);
    expect(markDirty).toHaveBeenCalledTimes(1);

    service.setStorageValue(player, "Quest.Example.Line", -1);
    expect(service.storageValue(player, "Quest.Example.Line")).toBe(-1);
    expect(player.storageSnapshot["Quest.Example.Line"]).toBeUndefined();
  });

  it("rejects out-of-range values", () => {
    const { service, player } = harness();
    expect(() =>
      service.setStorageValue(player, "Quest.Example.Line", 2_147_483_648),
    ).toThrow();
    expect(() =>
      service.setStorageValue(player, "Quest.Example.Line", 1.5),
    ).toThrow();
  });

  it("canonicalizes aliased keys onto one row", () => {
    const { service, player } = harness();
    service.setStorageValue(player, "Quest.Alias.Old", 7);
    expect(service.storageValue(player, "Quest.Canonical.New")).toBe(7);
    expect(service.storageValue(player, "Quest.Alias.Old")).toBe(7);
    expect(player.storageSnapshot["Quest.Alias.Old"]).toBeUndefined();
    expect(player.storageSnapshot["Quest.Canonical.New"]).toBe(7);
  });

  it("skips writes that change nothing and notifies on real changes", () => {
    const { service, player, markDirty, changes } = harness();
    service.setStorageValue(player, "Quest.Example.Line", 2);
    service.setStorageValue(player, "Quest.Example.Line", 2);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([{ key: "Quest.Example.Line", value: 2 }]);
  });

  it("advances monotonically, never lowering quest progress", () => {
    const { service, player } = harness();
    expect(service.advanceStorageValue(player, "Quest.Example.Line", 3)).toBe(
      true,
    );
    expect(service.advanceStorageValue(player, "Quest.Example.Line", 2)).toBe(
      false,
    );
    expect(service.storageValue(player, "Quest.Example.Line")).toBe(3);
  });
});
