import { describe, expect, it, vi } from "vitest";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  type ActionBar,
  type ActionBarAction,
  type ServerMessage,
} from "@tibia/protocol";
import { ActionBarHandler } from "./ActionBarHandler";
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
    {
      origin: "spell",
      vocations: ["Knight"],
      targetKind: "self",
    },
  ],
  [
    "exori",
    {
      origin: "spell",
      vocations: ["Knight"],
      targetKind: "direction",
    },
  ],
  [
    "utani-hur",
    {
      origin: "spell",
      vocations: ["Knight"],
      targetKind: "self",
    },
  ],
  [
    "utamo-vita",
    {
      origin: "spell",
      vocations: ["Sorcerer"],
      targetKind: "self",
    },
  ],
  [
    "exura vita",
    {
      origin: "spell",
      vocations: ["Druid"],
      targetKind: "self",
    },
  ],
  [
    "adori flam",
    {
      origin: "rune",
      vocations: ["Knight", "Sorcerer"],
      targetKind: "position",
    },
  ],
]);

function withFirstAction(
  action: ActionBarAction,
  hotkey = "Digit1",
): ActionBar {
  return createDefaultActionBar().map((slot, index) =>
    index === 0 ? { action, hotkey } : slot,
  );
}

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
    itemType: (itemTypeId: number) => {
      if (itemTypeId === 266) {
        return {
          id: 266,
          name: "health potion",
          clientId: 266,
          spriteId: 4321,
          useKind: "potion",
        };
      }
      if (itemTypeId === 3273) {
        return {
          id: 3273,
          name: "sword",
          clientId: 3273,
          spriteId: 5678,
          equipmentSlot: "weapon",
        };
      }
      return undefined;
    },
  } as unknown as ItemIntentHandler;
  return new ActionBarHandler(registry, world, spells, items, store);
}

function makeSession(playerId: string | null) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    playerId,
    actionBar: createDefaultActionBar(),
    actionBarUpdatePending: false,
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

async function settle(handler: ActionBarHandler) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes();
}

describe("ActionBarHandler", () => {
  it("rejects sessions without a joined character", () => {
    const { session, errors } = makeSession(null);
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: withFirstAction({
        kind: "spell",
        spellId: "exura ico",
        targetMode: "self",
      }),
    });
    expect(errors).toEqual(["join-required"]);
  });

  it.each([
    ["unknown spell", "utori kort"],
    ["another vocation's spell", "exura vita"],
    ["rune catalog entry as a spoken spell", "adori flam"],
  ])("rejects %s", (_label, spellId) => {
    const { session, errors } = makeSession("char-1");
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar: withFirstAction({
        kind: "spell",
        spellId,
        targetMode: "self",
      }),
    });
    expect(errors).toEqual(["action-bar-invalid"]);
    expect(session.actionBarUpdatePending).toBe(false);
  });

  it("rejects unknown objects and equipping non-equipment", () => {
    const handler = makeHandler(seededStore());
    const first = makeSession("char-1");
    handler.handle(first.session, {
      type: "update-action-bar",
      actionBar: withFirstAction({
        kind: "item",
        itemTypeId: 9999,
        mode: "use",
      }),
    });
    const second = makeSession("char-1");
    handler.handle(second.session, {
      type: "update-action-bar",
      actionBar: withFirstAction({
        kind: "item",
        itemTypeId: 266,
        mode: "equip",
      }),
    });
    expect(first.errors).toEqual(["action-bar-invalid"]);
    expect(second.errors).toEqual(["action-bar-invalid"]);
  });

  it("rejects duplicate hotkeys", () => {
    const { session, errors } = makeSession("char-1");
    const actionBar = createDefaultActionBar().map((slot, index) =>
      index === 1 ? { ...slot, hotkey: "Digit1" } : slot,
    );
    makeHandler(seededStore()).handle(session, {
      type: "update-action-bar",
      actionBar,
    });
    expect(errors).toEqual(["action-bar-invalid"]);
  });

  it("canonicalizes spell targeting, persists the layout, and acks", async () => {
    const store = seededStore();
    const handler = makeHandler(store);
    const { session, sent, errors } = makeSession("char-1");
    const requested = withFirstAction({
      kind: "spell",
      spellId: "exori",
      targetMode: "crosshair",
    });

    handler.handle(session, {
      type: "update-action-bar",
      actionBar: requested,
    });
    await settle(handler);

    expect(errors).toEqual([]);
    expect(session.actionBar[0]?.action).toEqual({
      kind: "spell",
      spellId: "exori",
      targetMode: "direction",
    });
    expect(sent).toEqual([
      { type: "action-bar-updated", actionBar: session.actionBar },
    ]);
    const character = await store.findByIdForAccount(
      "account-id",
      "char-1",
    );
    expect(character?.actionBar).toEqual(session.actionBar);
  });

  it("rejects a second update while one is pending", async () => {
    const handler = makeHandler(seededStore());
    const { session, errors } = makeSession("char-1");
    const actionBar = withFirstAction({
      kind: "spell",
      spellId: "exori",
      targetMode: "direction",
    });
    handler.handle(session, {
      type: "update-action-bar",
      actionBar,
    });
    handler.handle(session, {
      type: "update-action-bar",
      actionBar,
    });
    expect(errors).toEqual(["action-bar-update-pending"]);
    await settle(handler);
  });

  it("reports storage failures and restores the confirmed layout", async () => {
    const handler = makeHandler(new InMemoryCharacterStore());
    const { session, sent, errors } = makeSession("char-1");
    session.actionBar = withFirstAction({
      kind: "spell",
      spellId: "exura ico",
      targetMode: "self",
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    handler.handle(session, {
      type: "update-action-bar",
      actionBar: withFirstAction({
        kind: "spell",
        spellId: "exori",
        targetMode: "direction",
      }),
    });
    await settle(handler);

    expect(sent).toEqual([
      { type: "action-bar-updated", actionBar: session.actionBar },
    ]);
    expect(errors).toEqual(["action-bar-update-failed"]);
    expect(session.actionBarUpdatePending).toBe(false);
    warning.mockRestore();
  });
});
