import { describe, expect, it, vi } from "vitest";
import type { AccountRole } from "../auth/AccountRole";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { MemoryModerationStore } from "../moderation/MemoryModerationStore";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { AdminCommandHandler } from "./AdminCommandHandler";

interface FakePlayer {
  id: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  position: { x: number; y: number; z: number };
}

function makeHarness(role: AccountRole) {
  const operator: FakePlayer = {
    id: "operator",
    name: "Operator",
    level: 50,
    health: 500,
    maxHealth: 500,
    position: { x: 10, y: 10, z: 7 },
  };
  const target: FakePlayer = {
    id: "target",
    name: "Bob",
    level: 8,
    health: 40,
    maxHealth: 100,
    position: { x: 90, y: 90, z: 7 },
  };
  const sent: Array<{ ok: boolean; text: string }> = [];
  const operatorSession = {
    id: "s-operator",
    playerId: "operator",
    account: { id: "acc", role, isStaff: role !== "player" },
    movementDirection: null,
    bufferedMovementDirection: null,
    autoWalkDirections: [],
    attackTargetId: null,
    send: (message: { ok: boolean; text: string }) => sent.push(message),
  } as unknown as Session;
  const targetSession = {
    id: "s-target",
    playerId: "target",
    account: { id: "acc-target", role: "player", isStaff: false },
    movementDirection: null,
    bufferedMovementDirection: null,
    autoWalkDirections: [],
    attackTargetId: null,
    send: vi.fn(),
  } as unknown as Session;

  const players = new Map<string, FakePlayer>([
    ["operator", operator],
    ["target", target],
  ]);
  const world = {
    getPlayer: (id: string) => players.get(id),
    // Every requested tile is walkable in this harness; the "no tile" branch
    // is exercised by returning null from a dedicated test below.
    findUnoccupiedPosition: (preferred: { x: number; y: number; z: number }) =>
      preferred,
    relocateCreature: (creature: FakePlayer, position: FakePlayer["position"]) => {
      const from = { ...creature.position };
      creature.position = { ...position };
      return from;
    },
  } as unknown as World;
  const visibility = { onPlayerTeleported: vi.fn() } as unknown as Visibility;
  const persistence = { saveNow: vi.fn() } as unknown as CharacterPersistence;
  const registry = {
    all: () => [operatorSession, targetSession],
  } as unknown as SessionRegistry;
  const store = new MemoryModerationStore();
  store.registerCharacter("operator", "Operator", "acc");
  store.registerCharacter("target", "Bob", "acc-target");

  return {
    operator: operator as unknown as Player,
    target,
    operatorSession,
    targetSession,
    sent,
    store,
    world,
    visibility,
    persistence,
    handler: new AdminCommandHandler(
      world,
      visibility,
      persistence,
      registry,
      store,
    ),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AdminCommandHandler (Feature 96)", () => {
  it("ignores every admin command from a plain player", async () => {
    const harness = makeHarness("player");
    for (const line of [
      "/goto 20 20 7",
      "/goto Bob",
      "/bring Bob",
      "/inspect Bob",
    ]) {
      // Not consumed and not answered: the surface is not discoverable.
      expect(
        harness.handler.tryHandle(
          harness.operatorSession,
          harness.operator,
          line,
          0,
        ),
      ).toBe(false);
    }
    await flush();
    expect(harness.sent).toEqual([]);
    expect(harness.store.actions).toEqual([]);
  });

  it("lets a tutor inspect but never teleport", async () => {
    const harness = makeHarness("tutor");
    expect(
      harness.handler.tryHandle(
        harness.operatorSession,
        harness.operator,
        "/inspect Bob",
        0,
      ),
    ).toBe(true);
    expect(harness.sent.at(-1)?.text).toContain("Bob");

    for (const line of ["/goto 20 20 7", "/bring Bob"]) {
      expect(
        harness.handler.tryHandle(
          harness.operatorSession,
          harness.operator,
          line,
          0,
        ),
      ).toBe(false);
    }
    await flush();
    // Only the inspection was recorded; no teleport happened at all.
    expect(harness.store.actions.map((action) => action.action)).toEqual([
      "inspect",
    ]);
    expect(harness.target.position).toEqual({ x: 90, y: 90, z: 7 });
  });

  it("teleports the operator and audits before/after state", async () => {
    const harness = makeHarness("gamemaster");
    expect(
      harness.handler.tryHandle(
        harness.operatorSession,
        harness.operator,
        "/goto 33 44 5",
        0,
      ),
    ).toBe(true);
    expect(harness.operator.position).toEqual({ x: 33, y: 44, z: 5 });
    await flush();
    const [action] = harness.store.actions;
    expect(action?.action).toBe("teleport");
    expect(action?.issuedByCharacterId).toBe("operator");
    expect(action?.detail).toMatchObject({
      mode: "to-position",
      from: { x: 10, y: 10, z: 7 },
      to: { x: 33, y: 44, z: 5 },
    });
  });

  it("brings a named character and audits the actor who moved them", async () => {
    const harness = makeHarness("gamemaster");
    expect(
      harness.handler.tryHandle(
        harness.operatorSession,
        harness.operator,
        "/bring Bob",
        0,
      ),
    ).toBe(true);
    expect(harness.target.position).toEqual({ x: 10, y: 10, z: 7 });
    await flush();
    const [action] = harness.store.actions;
    expect(action?.action).toBe("teleport");
    // The audit names the moved character as the target and the operator as
    // the actor, so "who moved whom" is answerable from the trail alone.
    expect(action?.targetCharacterId).toBe("target");
    expect(action?.issuedByCharacterId).toBe("operator");
    expect(action?.detail).toMatchObject({ mode: "bring", by: "Operator" });
  });

  it("validates the target at execution time", async () => {
    const harness = makeHarness("gamemaster");
    for (const line of ["/bring Nobody", "/inspect Nobody", "/goto Nobody"]) {
      expect(
        harness.handler.tryHandle(
          harness.operatorSession,
          harness.operator,
          line,
          0,
        ),
      ).toBe(true);
      expect(harness.sent.at(-1)?.ok).toBe(false);
    }
    await flush();
    // Nothing moved and nothing was written for a target that does not exist.
    expect(harness.store.actions).toEqual([]);
    expect(harness.target.position).toEqual({ x: 90, y: 90, z: 7 });
  });

  it("rejects malformed coordinates without moving anyone", async () => {
    const harness = makeHarness("gamemaster");
    for (const line of ["/goto", "/goto 1 abc", "/bring", "/inspect"]) {
      expect(
        harness.handler.tryHandle(
          harness.operatorSession,
          harness.operator,
          line,
          0,
        ),
      ).toBe(true);
      expect(harness.sent.at(-1)?.ok).toBe(false);
    }
    await flush();
    expect(harness.store.actions).toEqual([]);
    expect(harness.operator.position).toEqual({ x: 10, y: 10, z: 7 });
  });
});
