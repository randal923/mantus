import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_POTION_SETTINGS,
  type ServerMessage,
} from "@tibia/protocol";
import { ActionBarHandler } from "./ActionBarHandler";
import type { SpellDefinition } from "./combat/Spell";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import { makeCharacter } from "./test/makeCharacter";

const KNIGHT_SPELLS = new Map<string, Partial<SpellDefinition>>([
  ["exura ico", { origin: "spell", vocations: ["Knight"] }],
  ["exori", { origin: "spell", vocations: ["Knight"] }],
  ["exura vita", { origin: "spell", vocations: ["Druid"] }],
  ["adori flam", { origin: "rune", vocations: ["Knight", "Sorcerer"] }],
]);

function makeHandler(store: InMemoryCharacterStore) {
  const registry = { contains: () => true } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) =>
      id === "char-1" ? { vocation: "Knight" } : undefined,
  } as unknown as World;
  const spells = {
    get: (spellId: string) => KNIGHT_SPELLS.get(spellId),
  } as unknown as SpellRegistry;
  return new ActionBarHandler(registry, world, spells, store);
}

function makeSession(playerId: string | null) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    playerId,
    actionBarUpdatePending: false,
    potionActionBarUpdatePending: false,
    autoPotionSettingsUpdatePending: false,
    autoPotionSettings: { ...DEFAULT_AUTO_POTION_SETTINGS },
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) => errors.push(code),
  } as unknown as Session;
  return { session, sent, errors };
}

function seededStore() {
  const store = new InMemoryCharacterStore();
  store.seed(makeCharacter("char-1"));
  return store;
}

async function settle(handler: ActionBarHandler) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes();
}

describe("ActionBarHandler", () => {
  it("rejects sessions without a joined character", () => {
    const { session, errors } = makeSession(null);
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: ["exura ico"],
    });
    expect(errors).toEqual(["join-required"]);
  });

  it("rejects spell ids that do not exist", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: ["utori kort"],
    });
    expect(errors).toEqual(["action-bar-invalid"]);
    expect(session.actionBarUpdatePending).toBe(false);
  });

  it("rejects spells of another vocation", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: ["exura vita"],
    });
    expect(errors).toEqual(["action-bar-invalid"]);
  });

  it("rejects rune spells in bar slots", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: ["adori flam"],
    });
    expect(errors).toEqual(["action-bar-invalid"]);
  });

  it("persists the layout and acks", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");
    const actionBar = ["exori", null, "exura ico"];
    handler.handle(session, { type: "update-action-bar", actionBar });
    await settle(handler);
    expect(errors).toEqual([]);
    expect(sent).toEqual([{ type: "action-bar-updated", actionBar }]);
    expect(session.actionBarUpdatePending).toBe(false);
    const character = await store.findByIdForAccount("account-id", "char-1");
    expect(character?.actionBar).toEqual(actionBar);
  });

  it("persists validated potion slots and their target modes", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");
    const potionActionBar = [
      { itemTypeId: 266, targetMode: "self" as const },
      null,
      { itemTypeId: 268, targetMode: "crosshair" as const },
    ];

    handler.handle(session, {
      type: "update-potion-action-bar",
      potionActionBar,
    });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(sent).toEqual([
      { type: "potion-action-bar-updated", potionActionBar },
    ]);
    const character = await store.findByIdForAccount(
      "account-id",
      "char-1",
    );
    expect(character?.potionActionBar).toEqual(potionActionBar);
  });

  it("rejects non-potion type ids in potion slots", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-potion-action-bar",
      potionActionBar: [{ itemTypeId: 3273, targetMode: "self" }],
    });
    expect(errors).toEqual(["action-bar-invalid"]);
    expect(session.potionActionBarUpdatePending).toBe(false);
  });

  it("persists validated auto potion rules and acks the active settings", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");
    const settings = {
      enabled: true,
      health: { itemTypeId: 239, thresholdPercent: 45 },
      mana: { itemTypeId: 268, thresholdPercent: 30 },
      priority: "health" as const,
    };

    handler.handle(session, {
      type: "update-auto-potion-settings",
      settings,
    });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(sent).toEqual([
      { type: "auto-potion-settings-updated", settings },
    ]);
    expect(session.autoPotionSettings).toEqual(settings);
    const character = await store.findByIdForAccount(
      "account-id",
      "char-1",
    );
    expect(character?.autoPotionSettings).toEqual(settings);
  });

  it("rejects a potion that cannot restore the configured resource", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-auto-potion-settings",
      settings: {
        enabled: true,
        health: { itemTypeId: 268, thresholdPercent: 50 },
        mana: null,
        priority: "health",
      },
    });

    expect(errors).toEqual(["action-bar-invalid"]);
    expect(session.autoPotionSettingsUpdatePending).toBe(false);
    expect(session.autoPotionSettings).toEqual(DEFAULT_AUTO_POTION_SETTINGS);
  });

  it("restores the confirmed auto potion settings after a storage failure", async () => {
    const handler = makeHandler(new InMemoryCharacterStore());
    const { session, sent, errors } = makeSession("char-1");

    handler.handle(session, {
      type: "update-auto-potion-settings",
      settings: {
        enabled: true,
        health: { itemTypeId: 239, thresholdPercent: 50 },
        mana: null,
        priority: "health",
      },
    });
    await settle(handler);

    expect(sent).toEqual([
      {
        type: "auto-potion-settings-updated",
        settings: DEFAULT_AUTO_POTION_SETTINGS,
      },
    ]);
    expect(errors).toEqual(["action-bar-update-failed"]);
    expect(session.autoPotionSettingsUpdatePending).toBe(false);
  });

  it("rejects a second update while one is pending", async () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");
    handler.handle(session, {
      type: "update-action-bar",
      actionBar: ["exori"],
    });
    handler.handle(session, { type: "update-action-bar", actionBar: [] });
    expect(errors).toEqual(["action-bar-update-pending"]);
    await settle(handler);
  });

  it("reports a storage failure and clears the pending flag", async () => {
    const handler = makeHandler(new InMemoryCharacterStore());
    const { session, sent, errors } = makeSession("char-1");
    handler.handle(session, {
      type: "update-action-bar",
      actionBar: ["exori"],
    });
    await settle(handler);
    expect(sent).toEqual([]);
    expect(errors).toEqual(["action-bar-update-failed"]);
    expect(session.actionBarUpdatePending).toBe(false);
  });
});
