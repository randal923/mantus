import { describe, expect, it, vi } from "vitest";
import type { Combat } from "./Combat";
import { CombatIntentHandler } from "./CombatIntentHandler";
import type { Session } from "../Session";

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
    const handler = new CombatIntentHandler(combat);

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
});
