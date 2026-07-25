import { describe, expect, it } from "vitest";
import type { ServerMessage, UiSettings } from "@tibia/protocol";
import { UiSettingsHandler } from "./UiSettingsHandler";
import { InMemoryAccountStore } from "./test/InMemoryAccountStore";
import type { Account } from "./AccountStore";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";

const LAYOUT = { x: 40, y: 120, width: 360, height: 264 };

function makeSession(account: Account | null) {
  const sent: ServerMessage[] = [];
  const errors: string[] = [];
  const session = {
    account,
    uiSettingsUpdatePending: false,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) => errors.push(code),
  } as unknown as Session;
  return { session, sent, errors };
}

async function seededHandler(session: Session, peers: Session[] = []) {
  const store = new InMemoryAccountStore();
  const account = await store.findOrCreateBySupabaseId("user-1", null, "en");
  session.account = account;
  for (const peer of peers) peer.account = account;
  const registry = {
    contains: () => true,
    all: () => [session, ...peers],
  } as unknown as SessionRegistry;
  return { store, handler: new UiSettingsHandler(registry, store) };
}

async function settle(handler: UiSettingsHandler) {
  await new Promise((resolve) => setImmediate(resolve));
  handler.applyResolvedOutcomes();
}

describe("UiSettingsHandler", () => {
  it("rejects unauthenticated sessions", () => {
    const { session, errors } = makeSession(null);
    const registry = {
      contains: () => true,
      all: () => [session],
    } as unknown as SessionRegistry;
    const handler = new UiSettingsHandler(registry, new InMemoryAccountStore());
    handler.handle(session, {
      type: "update-ui-settings",
      settings: { minimap: LAYOUT },
    });
    expect(errors).toEqual(["auth-required"]);
  });

  it("persists settings, updates the session account, and acks", async () => {
    const { session, sent, errors } = makeSession(null);
    const { handler } = await seededHandler(session);
    const settings: UiSettings = {
      minimap: LAYOUT,
      chatPinnedOpen: true,
      turnModifier: "Control",
    };
    handler.handle(session, { type: "update-ui-settings", settings });
    await settle(handler);
    expect(errors).toEqual([]);
    expect(sent).toEqual([{ type: "ui-settings-updated", settings }]);
    expect(session.account?.uiSettings).toEqual(settings);
    expect(session.uiSettingsUpdatePending).toBe(false);
  });

  it("rejects a second update while one is pending", async () => {
    const { session, errors } = makeSession(null);
    const { handler } = await seededHandler(session);
    handler.handle(session, {
      type: "update-ui-settings",
      settings: { minimap: LAYOUT },
    });
    handler.handle(session, { type: "update-ui-settings", settings: {} });
    expect(errors).toEqual(["ui-settings-update-pending"]);
    await settle(handler);
  });

  it("reports a storage failure and clears the pending flag", async () => {
    const { session, sent, errors } = makeSession(null);
    const { handler } = await seededHandler(session);
    session.account = { ...session.account!, id: "unknown-account" };
    handler.handle(session, {
      type: "update-ui-settings",
      settings: { minimap: LAYOUT },
    });
    await settle(handler);
    expect(sent).toEqual([]);
    expect(errors).toEqual(["ui-settings-update-failed"]);
    expect(session.uiSettingsUpdatePending).toBe(false);
  });

  it("acks every live session of the same account", async () => {
    const first = makeSession(null);
    const second = makeSession(null);
    const { handler } = await seededHandler(first.session, [second.session]);

    handler.handle(first.session, {
      type: "update-ui-settings",
      settings: { minimap: LAYOUT },
    });
    await settle(handler);

    // The second client converges without relogging.
    for (const peer of [first, second]) {
      expect(peer.sent.at(-1)).toEqual({
        type: "ui-settings-updated",
        settings: { minimap: LAYOUT },
      });
      expect(peer.session.account?.uiSettings).toEqual({ minimap: LAYOUT });
    }
  });
});
