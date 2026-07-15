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
