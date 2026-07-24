import { describe, expect, it, vi } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./Character";
import { CharacterPersistence } from "./CharacterPersistence";
import type { CharacterStore } from "./CharacterStore";

const makeStore = (
  saveSnapshot: CharacterStore["saveSnapshot"],
): CharacterStore => ({
  async listByAccountId(): Promise<CharacterSummary[]> {
    return [];
  },
  async create(character: Character): Promise<Character> {
    return character;
  },
  async findByIdForAccount(): Promise<Character | null> {
    return null;
  },
  async recordLogin(): Promise<void> {},
  async updateActionBar(): Promise<void> {},
  saveSnapshot,
});

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("CharacterPersistence", () => {
  it("serializes immutable snapshots with increasing expected versions", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      if (snapshots.length === 1) await firstSave;
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });

    persistence.track(player, 0);
    player.moveTo({ x: 1, y: 0, z: 7 });
    persistence.saveNow(player, 1);
    await nextTurn();
    player.moveTo({ x: 2, y: 0, z: 7 });
    persistence.saveNow(player, 2);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ expectedVersion: 1, positionX: 1 });
    releaseFirst?.();
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({ expectedVersion: 2, positionX: 2 });
    expect(persistence.unsavedPlayerCount).toBe(0);
  });

  it("flags skills and storage as unchanged for movement-only saves", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });

    persistence.track(player, 0);
    player.moveTo({ x: 1, y: 0, z: 7 });
    persistence.saveNow(player, 1);
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      skillsChanged: false,
      storageChanged: false,
    });

    player.setStorageValue("quest.flag", 1);
    player.progression.awardSkillTries("event-1", "fist", 50);
    persistence.saveNow(player, 3);
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({
      skillsChanged: true,
      storageChanged: true,
    });
    expect(snapshots[1]?.storageValues).toMatchObject({ "quest.flag": 1 });

    player.moveTo({ x: 2, y: 0, z: 7 });
    persistence.saveNow(player, 5);
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]).toMatchObject({
      skillsChanged: false,
      storageChanged: false,
    });
  });

  it("retries transient database failures", async () => {
    let attempts = 0;
    const store = makeStore(async (snapshot) => {
      attempts += 1;
      if (attempts < 3) {
        const code = attempts === 1 ? "ECONNRESET" : "40001";
        throw Object.assign(new Error("retry"), { code });
      }
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 2, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });

    persistence.track(player, 0);
    persistence.saveNow(player, 1);
    await persistence.flushCharacter(player.id);

    expect(attempts).toBe(3);
    expect(persistence.unsavedPlayerCount).toBe(0);
  });

  it("persists progression event ids with the awarded snapshot", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 0, 0);
    const player = new Player(
      makeCharacter("character-id"),
      { x: 0, y: 0, z: 7 },
      0,
    );

    persistence.track(player, 0);
    player.awardExperience("kill:rat:1", 100);
    persistence.saveNow(player, 1);
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      level: 2,
      progressionEvents: [{ id: "kill:rat:1", type: "experience" }],
    });
  });

  it("queues dirty state when the save interval elapses", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 100, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });

    persistence.track(player, 0);
    player.moveTo({ x: 1, y: 0, z: 7 });
    persistence.markDirty(player);
    persistence.tick(99);
    await nextTurn();
    expect(snapshots).toHaveLength(0);

    persistence.tick(100);
    await persistence.flushCharacter(player.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ positionX: 1 });
  });

  it("bounds periodic snapshot enqueue work per tick", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const persistence = new CharacterPersistence(
      makeStore(async (snapshot) => {
        snapshots.push(snapshot);
        return snapshot.expectedVersion + 1;
      }),
      100,
      0,
      0,
    );
    const players = Array.from({ length: 12 }, (_, index) => {
      const player = new Player(makeCharacter(`character-${index}`), {
        x: index,
        y: 0,
        z: 7,
      });
      persistence.track(player, 0);
      persistence.markDirty(player);
      return player;
    });

    persistence.tick(100);
    await nextTurn();
    expect(snapshots).toHaveLength(8);

    persistence.tick(125);
    await Promise.all(
      players.map((player) => persistence.flushCharacter(player.id)),
    );
    expect(snapshots).toHaveLength(12);
  });

  it("coordinates an external atomic mutation with snapshot versions", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 1, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });
    persistence.track(player, 0);
    player.spendMana(5);
    persistence.markDirty(player);

    const expectedVersion = await persistence.beginExternalMutation(player, 1);
    expect(expectedVersion).toBe(2);
    expect(persistence.isExternalMutationPending(player)).toBe(true);
    player.moveTo({ x: 1, y: 0, z: 7 });
    persistence.markDirty(player);
    persistence.tick(2);
    await nextTurn();
    expect(snapshots).toHaveLength(1);

    persistence.completeExternalMutation(player, expectedVersion, 3);
    persistence.saveNow(player, 3);
    await persistence.flushCharacter(player.id);

    expect(snapshots[1]).toMatchObject({
      expectedVersion: 3,
      positionX: 1,
    });
  });

  it("can preserve dirty state across an external atomic mutation", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });
    persistence.track(player, 0);
    player.moveTo({ x: 1, y: 0, z: 7 });
    persistence.markDirty(player);

    const expectedVersion = await persistence.beginExternalMutation(
      player,
      1,
      { flushDirty: false },
    );

    expect(expectedVersion).toBe(1);
    expect(snapshots).toHaveLength(0);
    player.moveTo({ x: 20, y: 20, z: 6 });
    persistence.completeExternalMutation(player, expectedVersion, 2);
    await persistence.flushCharacter(player.id);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      expectedVersion: 2,
      positionX: 20,
      positionY: 20,
      positionZ: 6,
    });
  });

  it("does not let relog flushing pass an unfinished external mutation", async () => {
    const persistence = new CharacterPersistence(
      makeStore(async (snapshot) => snapshot.expectedVersion + 1),
      30_000,
      0,
      0,
    );
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });
    persistence.track(player, 0);
    const expectedVersion = await persistence.beginExternalMutation(player, 1);
    persistence.untrack(player, 2);
    let flushed = false;
    const flush = persistence.flushCharacter(player.id).then(() => {
      flushed = true;
    });

    await nextTurn();
    expect(flushed).toBe(false);

    persistence.completeExternalMutation(
      player,
      expectedVersion,
      expectedVersion + 1,
    );
    await flush;
    expect(flushed).toBe(true);
    expect(persistence.unsavedPlayerCount).toBe(0);
  });

  it("does not snapshot optimistic state after an external mutation fails", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const persistence = new CharacterPersistence(
      makeStore(async (snapshot) => {
        snapshots.push(snapshot);
        return snapshot.expectedVersion + 1;
      }),
      30_000,
      0,
      0,
    );
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });
    const failure = new Error("atomic potion write failed");
    persistence.track(player, 0);
    await persistence.beginExternalMutation(player, 1);
    player.setHealth(player.health + 1);
    persistence.markDirty(player);

    persistence.failExternalMutation(player, failure);
    persistence.untrack(player, 2);

    await expect(persistence.flushCharacter(player.id)).resolves.toBeUndefined();
    expect(snapshots).toHaveLength(0);
  });

  it("retains a failed save in the unsaved-player metric", async () => {
    const failure = new Error("database unavailable");
    const store = makeStore(async () => {
      throw failure;
    });
    const persistence = new CharacterPersistence(store, 30_000, 2, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    persistence.track(player, 0);
    persistence.saveNow(player, 1);

    await expect(persistence.flushCharacter(player.id)).rejects.toBe(failure);
    expect(persistence.unsavedPlayerCount).toBe(1);
    await persistence.stop();
    error.mockRestore();
  });

  it("flushes dirty online characters during shutdown", async () => {
    const snapshots: CharacterSaveSnapshot[] = [];
    const store = makeStore(async (snapshot) => {
      snapshots.push(snapshot);
      return snapshot.expectedVersion + 1;
    });
    const persistence = new CharacterPersistence(store, 30_000, 0, 0);
    const player = new Player(makeCharacter("character-id"), {
      x: 0,
      y: 0,
      z: 7,
    });

    persistence.track(player, 0);
    player.direction = "east";
    persistence.markDirty(player);
    await persistence.stop();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ direction: "east" });
    expect(persistence.unsavedPlayerCount).toBe(0);
  });
});
