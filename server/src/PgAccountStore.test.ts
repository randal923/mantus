import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgAccountStore } from "./PgAccountStore";

describe("PgAccountStore fight modes", () => {
  it("loads a validated persisted fight mode", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: "account-1",
          supabase_user_id: "user-1",
          email: null,
          banned_until: null,
          premium_until: null,
          language: "en",
          ui_settings: { chatPinnedOpen: true },
          fight_mode: { attack: "defensive", chase: true, secure: false },
        },
      ],
    }));
    const store = new PgAccountStore({ query } as unknown as Pool);

    const account = await store.findOrCreateBySupabaseId(
      "user-1",
      null,
      "en",
    );

    expect(account.uiSettings).toEqual({ chatPinnedOpen: true });
    expect(account.fightMode).toEqual({
      attack: "defensive",
      chase: true,
      secure: false,
    });
  });

  it("falls back to safe defaults for an invalid stored mode", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: "account-1",
          supabase_user_id: "user-1",
          email: null,
          banned_until: null,
          premium_until: null,
          language: "en",
          ui_settings: {},
          fight_mode: { attack: "offensive", chase: "yes", secure: true },
        },
      ],
    }));
    const store = new PgAccountStore({ query } as unknown as Pool);

    const account = await store.findOrCreateBySupabaseId(
      "user-1",
      null,
      "en",
    );

    expect(account.fightMode).toEqual({
      attack: "offensive",
      chase: false,
      secure: true,
    });
  });

  it("updates the account with a parameterized JSON value", async () => {
    const query = vi.fn(async () => ({ rowCount: 1 }));
    const store = new PgAccountStore({ query } as unknown as Pool);
    const mode = { attack: "balanced", chase: false, secure: true } as const;

    await store.updateFightMode("account-1", mode);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("$2::jsonb"), [
      "account-1",
      JSON.stringify(mode),
    ]);
  });
});
