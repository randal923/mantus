import { describe, expect, it, vi } from "vitest";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { gridMapData } from "../gridMapData";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { ProgressionSystem } from "./ProgressionSystem";

const PLAYER_ID = "00000000-0000-4000-8000-000000000001";

describe("ProgressionSystem rates", () => {
  it("scales server-authored skill and magic progress", () => {
    const harness = makeHarness({ skill: 2, magic: 3 });

    expect(
      harness.progression.awardSkillTries(
        PLAYER_ID,
        "skill:sword:1",
        "sword",
        10,
        1_000,
      ),
    ).toBe(true);
    expect(
      harness.progression.awardMagicProgress(
        PLAYER_ID,
        "magic:spell:1",
        100,
        1_000,
      ),
    ).toBe(true);

    expect(
      harness.player.progression.skills.find(({ skill }) => skill === "sword")
        ?.tries,
    ).toBe(20);
    expect(harness.player.progression.manaSpent).toBe(300);
  });

  it("floors fractional progress to whole units", () => {
    const harness = makeHarness({ skill: 1.5, magic: 1.5 });

    harness.progression.awardSkillTries(
      PLAYER_ID,
      "skill:sword:2",
      "sword",
      3,
      1_000,
    );
    harness.progression.awardMagicProgress(
      PLAYER_ID,
      "magic:spell:2",
      5,
      1_000,
    );

    expect(
      harness.player.progression.skills.find(({ skill }) => skill === "sword")
        ?.tries,
    ).toBe(4);
    expect(harness.player.progression.manaSpent).toBe(7);
  });

  it("persists spent resources when magic progress is disabled", () => {
    const harness = makeHarness({ skill: 0, magic: 0 });
    expect(harness.player.spendMana(5)).toBe(true);

    expect(
      harness.progression.awardMagicProgress(
        PLAYER_ID,
        "magic:disabled:1",
        5,
        1_000,
      ),
    ).toBe(true);
    expect(
      harness.progression.awardSkillTries(
        PLAYER_ID,
        "skill:disabled:1",
        "sword",
        1,
        1_000,
      ),
    ).toBe(false);

    expect(harness.player.progression.manaSpent).toBe(0);
    expect(harness.persistence.saveNow).toHaveBeenCalledWith(
      harness.player,
      1_000,
    );
  });

  it("persists spent mana when a progression event id is replayed after restart", () => {
    const eventId = "magic:restarted:run-a:1";
    const harness = makeHarness(
      { skill: 1, magic: 1 },
      [eventId],
    );
    expect(harness.player.spendMana(5)).toBe(true);

    expect(
      harness.progression.awardMagicProgress(
        PLAYER_ID,
        eventId,
        5,
        1_000,
      ),
    ).toBe(false);
    expect(harness.persistence.saveNow).toHaveBeenCalledWith(
      harness.player,
      1_000,
    );
  });
});

function makeHarness(
  rates: { skill: number; magic: number },
  progressionEventIds: ReadonlyArray<string> = [],
) {
  const world = new World(
    gridMapData({
      name: "progression-rate-test",
      width: 8,
      height: 8,
      blocked: [],
    }),
    25,
  );
  const player = new Player(
    { ...makeCharacter(PLAYER_ID), progressionEventIds },
    { x: 1, y: 1, z: 7 },
    0,
  );
  world.addPlayer(player);
  const persistence = {
    saveNow: vi.fn(),
    markDirty: vi.fn(),
    isExternalMutationPending: vi.fn(() => false),
  } as unknown as CharacterPersistence;
  const progression = new ProgressionSystem(
    world,
    { sessionFor: () => undefined } as unknown as SessionRegistry,
    persistence,
    { updateCapacity: () => null } as unknown as ItemIntentHandler,
    rates,
  );
  return { player, persistence, progression };
}
