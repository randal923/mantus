import { describe, expect, it, vi } from "vitest";
import type { AccountStore } from "../AccountStore";
import type { Combat } from "./Combat";
import { CombatIntentHandler } from "./CombatIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";

describe("CombatIntentHandler", () => {
  it("routes every bounded combat intent to the tick-owned combat system", () => {
    const combat = {
      selectTarget: vi.fn(),
      cancelTarget: vi.fn(),
      setFightMode: vi.fn(),
      castSpell: vi.fn(),
      useRune: vi.fn(),
    } as unknown as Combat;
    const session = {} as Session;
    const accounts = {} as AccountStore;
    const registry = {} as SessionRegistry;
    const handler = new CombatIntentHandler(combat, accounts, registry);

    handler.handle(
      session,
      { type: "attack-target", creatureId: "monster" },
      1_000,
    );
    handler.handle(session, { type: "cancel-attack" }, 1_001);
    handler.handle(
      session,
      {
        type: "set-fight-mode",
        mode: { attack: "offensive", chase: false, secure: true },
      },
      1_002,
    );
    handler.handle(
      session,
      {
        type: "cast-spell",
        spellId: "light-healing",
        target: { kind: "self" },
      },
      1_003,
    );
    handler.handle(
      session,
      {
        type: "use-rune",
        itemId: "434b8502-04e2-4e3b-875d-f9be2153016c",
        revision: 1,
        target: { kind: "attack-target" },
      },
      1_004,
    );

    expect(combat.selectTarget).toHaveBeenCalledWith(session, "monster", 1_000);
    expect(combat.cancelTarget).toHaveBeenCalledWith(session, 1_001);
    expect(combat.setFightMode).toHaveBeenCalledOnce();
    expect(combat.castSpell).toHaveBeenCalledOnce();
    expect(combat.useRune).toHaveBeenCalledOnce();
  });

  it("persists accepted fight modes on the account", async () => {
    const updateFightMode = vi.fn(async () => undefined);
    const accounts = { updateFightMode } as unknown as AccountStore;
    const registry = { contains: () => true } as unknown as SessionRegistry;
    const combat = {
      setFightMode: vi.fn(() => true),
    } as unknown as Combat;
    const session = {
      account: {
        id: "account-1",
        supabaseUserId: "user-1",
        email: null,
        bannedUntil: null,
        premiumUntil: null,
        language: "en",
        uiSettings: {},
        fightMode: { attack: "balanced", chase: true, secure: false },
      },
      sendError: vi.fn(),
    } as unknown as Session;
    const handler = new CombatIntentHandler(combat, accounts, registry);
    const mode = { attack: "offensive", chase: false, secure: true } as const;

    handler.handle(session, { type: "set-fight-mode", mode }, 1_000);
    await new Promise((resolve) => setImmediate(resolve));
    handler.applyResolvedOutcomes();

    expect(updateFightMode).toHaveBeenCalledWith("account-1", mode);
    expect(session.account?.fightMode).toEqual(mode);
  });

  it("serializes rapid changes and persists the latest mode last", async () => {
    let resolveFirst: (() => void) | undefined;
    const updateFightMode = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const accounts = { updateFightMode } as unknown as AccountStore;
    const registry = { contains: () => true } as unknown as SessionRegistry;
    const combat = {
      setFightMode: vi.fn(() => true),
    } as unknown as Combat;
    const session = {
      account: {
        id: "account-1",
        supabaseUserId: "user-1",
        email: null,
        bannedUntil: null,
        premiumUntil: null,
        language: "en",
        uiSettings: {},
        fightMode: { attack: "offensive", chase: false, secure: true },
      },
      sendError: vi.fn(),
    } as unknown as Session;
    const handler = new CombatIntentHandler(combat, accounts, registry);
    const first = { attack: "balanced", chase: true, secure: true } as const;
    const latest = { attack: "defensive", chase: false, secure: false } as const;

    handler.handle(
      session,
      { type: "set-fight-mode", mode: first },
      1_000,
    );
    handler.handle(
      session,
      { type: "set-fight-mode", mode: latest },
      1_001,
    );

    expect(updateFightMode).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await new Promise((resolve) => setImmediate(resolve));
    handler.applyResolvedOutcomes();
    await new Promise((resolve) => setImmediate(resolve));
    handler.applyResolvedOutcomes();

    expect(updateFightMode.mock.calls).toEqual([
      ["account-1", first],
      ["account-1", latest],
    ]);
    expect(session.account?.fightMode).toEqual(latest);
  });
});
