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

async function seededHandler(session: Session) {
  const store = new InMemoryAccountStore();
  const account = await store.findOrCreateBySupabaseId("user-1", null, "en");
  session.account = account;
  const registry = {
    contains: () => true,
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
    const registry = { contains: () => true } as unknown as SessionRegistry;
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
    const settings: UiSettings = { minimap: LAYOUT };
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
});
