import { describe, expect, it, vi } from "vitest";
import { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { CombatFeedback } from "./CombatFeedback";
import type { ConditionApplication } from "./Condition";
import { ConditionSystem } from "./ConditionSystem";
import type { DamageResolver } from "./DamageResolver";

const TARGET_ID = "00000000-0000-4000-8000-000000000021";
const ATTACKER_ID = "00000000-0000-4000-8000-000000000022";

function paralysis(sourceId: string | null): ConditionApplication {
  return { type: "paralyze", sourceId, durationMs: 5_000, magnitude: 30 };
}

function harness(options: {
  removeChance?: Partial<Record<string, number>>;
  deflect?: Partial<Record<string, boolean>>;
  rollOutcome?: boolean;
}) {
  const target = new Player(
    makeCharacter(TARGET_ID, "Target"),
    { x: 1, y: 1, z: 7 },
    0,
  );
  const attacker = new Player(
    makeCharacter(ATTACKER_ID, "Attacker"),
    { x: 2, y: 1, z: 7 },
    0,
  );
  const players = new Map([
    [TARGET_ID, target],
    [ATTACKER_ID, attacker],
  ]);
  const sends = new Map<string, Array<{ type: string; text?: string }>>();
  const system = new ConditionSystem(
    {
      getPlayer: (id: string) => players.get(id),
      allCreatures: () => [],
    } as unknown as World,
    {
      broadcastMagicEffect: vi.fn(),
      onCreatureStateChanged: vi.fn(),
    } as unknown as Visibility,
    {
      sessionFor: (id: string) => ({
        send: (message: { type: string; text?: string }) => {
          const list = sends.get(id) ?? [];
          list.push(message);
          sends.set(id, list);
        },
      }),
    } as unknown as SessionRegistry,
    {
      sendFightStateForPlayer: vi.fn(),
    } as unknown as CombatFeedback,
    { applyDamage: vi.fn() } as unknown as DamageResolver,
    {
      paralysisRemoveChancePercent: (id) =>
        options.removeChance?.[id] ?? 0,
      pvpDeflect: (id) => options.deflect?.[id] ?? false,
      roll: (percent) => percent > 0 && (options.rollOutcome ?? false),
    },
  );
  return { system, target, attacker, sends };
}

describe("ConditionSystem vibrancy", () => {
  it("deflects player-cast paralysis onto a non-vibrant attacker and blocks the target", () => {
    const { system, target, attacker } = harness({
      deflect: { [TARGET_ID]: true },
    });
    const applied = system.applyCondition(
      target,
      paralysis(ATTACKER_ID),
      1_000,
    );
    expect(applied).toBe(false);
    expect(target.conditions.has("paralyze")).toBe(false);
    expect(attacker.conditions.has("paralyze")).toBe(true);
  });

  it("does not clone onto an attacker whose own boots deflect, but still blocks", () => {
    const { system, target, attacker } = harness({
      deflect: { [TARGET_ID]: true, [ATTACKER_ID]: true },
    });
    const applied = system.applyCondition(
      target,
      paralysis(ATTACKER_ID),
      1_000,
    );
    expect(applied).toBe(false);
    expect(target.conditions.has("paralyze")).toBe(false);
    expect(attacker.conditions.has("paralyze")).toBe(false);
  });

  it("never deflects monster paralysis; a failed removal roll lets it land", () => {
    const { system, target, attacker } = harness({
      deflect: { [TARGET_ID]: true },
      removeChance: { [TARGET_ID]: 42 },
      rollOutcome: false,
    });
    const applied = system.applyCondition(
      target,
      paralysis("monster-1"),
      1_000,
    );
    expect(applied).toBe(true);
    expect(target.conditions.has("paralyze")).toBe(true);
    expect(attacker.conditions.has("paralyze")).toBe(false);
  });

  it("strips a running paralysis when the removal roll succeeds", () => {
    const { system, target, sends } = harness({
      removeChance: { [TARGET_ID]: 42 },
      rollOutcome: true,
    });
    target.conditions.apply(paralysis("monster-0"), 500);
    const applied = system.applyCondition(
      target,
      paralysis("monster-1"),
      1_000,
    );
    expect(applied).toBe(false);
    expect(target.conditions.has("paralyze")).toBe(false);
    expect(
      sends
        .get(TARGET_ID)
        ?.some((m) => m.text === "You are unparalyzed by vibrancy."),
    ).toBe(true);
  });

  it("applies normally when the target has no vibrancy", () => {
    const { system, target, attacker } = harness({});
    const applied = system.applyCondition(
      target,
      paralysis(ATTACKER_ID),
      1_000,
    );
    expect(applied).toBe(true);
    expect(target.conditions.has("paralyze")).toBe(true);
    expect(attacker.conditions.has("paralyze")).toBe(false);
  });
});
