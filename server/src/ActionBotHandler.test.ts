import { describe, expect, it, vi } from "vitest";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  type ServerMessage,
} from "@tibia/protocol";
import { ActionBotHandler } from "./ActionBotHandler";
import type { SpellDefinition } from "./combat/Spell";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import { makeCharacter } from "./test/makeCharacter";

const SPELLS = new Map<string, Partial<SpellDefinition>>([
  [
    "exura ico",
    { origin: "spell", vocations: ["Knight"], targetKind: "self" },
  ],
  [
    "utani-hur",
    { origin: "spell", vocations: ["Knight"], targetKind: "self" },
  ],
  [
    "utamo-vita",
    { origin: "spell", vocations: ["Sorcerer"], targetKind: "self" },
  ],
  [
    "exura vita",
    { origin: "spell", vocations: ["Druid"], targetKind: "self" },
  ],
]);

function makeHandler(store: InMemoryCharacterStore) {
  const registry = { contains: () => true } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) =>
      id === "char-1" ? { vocation: "Knight" } : undefined,
  } as unknown as World;
  const spells = {
    get: (spellId: string) => SPELLS.get(spellId),
  } as unknown as SpellRegistry;
  const items = {
    itemType: (itemTypeId: number) =>
      itemTypeId === 266 ? { id: 266, useKind: "potion" } : undefined,
  } as unknown as ItemIntentHandler;
  return new ActionBotHandler(registry, world, spells, items, store);
}

function makeSession(playerId: string | null) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    playerId,
    actionBar: createDefaultActionBar(),
    actionBotUpdatePending: false,
    actionBotSettings: { ...DEFAULT_ACTION_BOT_SETTINGS },
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

async function settle(handler: ActionBotHandler) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes();
}

describe("ActionBotHandler", () => {
  it("rejects sessions without a joined character", () => {
    const { session, errors } = makeSession(null);
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bot",
      settings: DEFAULT_ACTION_BOT_SETTINGS,
    });
    expect(errors).toEqual(["join-required"]);
  });

  it("persists automation rules without touching the action bar", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");
    const settings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "heal",
          enabled: true,
          action: {
            kind: "item" as const,
            itemTypeId: 266,
            mode: "use-on-self" as const,
          },
          trigger: {
            kind: "resource-below" as const,
            resource: "health" as const,
            percent: 45,
          },
          unequipWhenInactive: false,
        },
      ],
    };

    handler.handle(session, { type: "update-action-bot", settings });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(session.actionBotSettings).toEqual(settings);
    expect(session.actionBar).toEqual(createDefaultActionBar());
    expect(sent).toEqual([{ type: "action-bot-updated", settings }]);
    const character = await store.findByIdForAccount("account-id", "char-1");
    expect(character?.actionBotSettings).toEqual(settings);
    expect(character?.actionBar).toEqual(createDefaultActionBar());
  });

  it("persists auto haste on its own", async () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");
    const settings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      autoHaste: { enabled: true, spellId: "utani-hur" as const },
    };

    handler.handle(session, { type: "update-action-bot", settings });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(session.actionBotSettings).toEqual(settings);
  });

  it("rejects an automatic support spell restricted to another vocation", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        autoUtamoVita: true,
      },
    });
    expect(errors).toEqual(["action-bot-invalid"]);
    expect(session.actionBotUpdatePending).toBe(false);
  });

  it("rejects a rule casting another vocation's spell", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "invalid",
            enabled: true,
            action: {
              kind: "spell",
              spellId: "exura vita",
              targetMode: "self",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    expect(errors).toEqual(["action-bot-invalid"]);
    expect(session.actionBotUpdatePending).toBe(false);
  });

  it("rejects a rule naming an unknown object", () => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "invalid",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 9999,
              mode: "use-on-self",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    expect(errors).toEqual(["action-bot-invalid"]);
    expect(session.actionBotUpdatePending).toBe(false);
  });

  it("rejects duplicate rule ids", () => {
    const { session, errors } = makeSession("char-1");
    const rule = {
      id: "heal",
      enabled: true,
      action: {
        kind: "spell" as const,
        spellId: "exura ico",
        targetMode: "self" as const,
      },
      trigger: { kind: "target-present" as const },
      unequipWhenInactive: false,
    };
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [rule, { ...rule }],
      },
    });
    expect(errors).toEqual(["action-bot-invalid"]);
    expect(session.actionBotUpdatePending).toBe(false);
  });

  it("rejects a second update while one is pending", async () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");
    handler.handle(session, {
      type: "update-action-bot",
      settings: DEFAULT_ACTION_BOT_SETTINGS,
    });
    handler.handle(session, {
      type: "update-action-bot",
      settings: DEFAULT_ACTION_BOT_SETTINGS,
    });
    expect(errors).toEqual(["action-bot-update-pending"]);
    await settle(handler);
  });

  it("reports storage failures and restores the confirmed settings", async () => {
    const handler = makeHandler(new InMemoryCharacterStore());
    const { session, sent, errors } = makeSession("char-1");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    handler.handle(session, {
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "heal",
            enabled: true,
            action: {
              kind: "spell",
              spellId: "exura ico",
              targetMode: "self",
            },
            trigger: {
              kind: "resource-below",
              resource: "health",
              percent: 50,
            },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    await settle(handler);

    expect(sent).toEqual([
      {
        type: "action-bot-updated",
        settings: session.actionBotSettings,
      },
    ]);
    expect(session.actionBotSettings).toEqual(DEFAULT_ACTION_BOT_SETTINGS);
    expect(errors).toEqual(["action-bot-update-failed"]);
    expect(session.actionBotUpdatePending).toBe(false);
    warning.mockRestore();
  });
});
