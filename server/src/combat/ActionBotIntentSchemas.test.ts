import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  PROTOCOL_LIMITS,
  clientMessageSchema,
} from "@tibia/protocol";
import { describe, expect, it } from "vitest";

function settings(percent: number) {
  return {
    ...DEFAULT_ACTION_BOT_SETTINGS,
    enabled: true,
    rules: [
      {
        id: "health-potion",
        enabled: true,
        action: {
          kind: "item",
          itemTypeId: 239,
          mode: "use-on-self",
        },
        trigger: {
          kind: "resource-below",
          resource: "health",
          percent,
        },
        unequipWhenInactive: false,
      },
    ],
  };
}

describe("action bot intent schema", () => {
  it("accepts a bounded server-evaluated rule", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bot",
        settings: settings(45),
      }).success,
    ).toBe(true);
  });

  it.each([0, 100, 50.5])(
    "rejects an out-of-range threshold of %s",
    (percent) => {
      expect(
        clientMessageSchema.safeParse({
          type: "update-action-bot",
          settings: settings(percent),
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a rule action the bot must never perform", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bot",
        settings: {
          ...settings(45),
          rules: [
            {
              ...settings(45).rules[0],
              action: {
                kind: "text",
                text: "hi",
                sendAutomatically: true,
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects extra client-authored outcome fields", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bot",
        settings: {
          ...settings(45),
          targetPlayerId: "00000000-0000-4000-8000-000000000099",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an unsupported automatic haste spell", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bot",
        settings: {
          ...settings(45),
          autoHaste: {
            enabled: true,
            spellId: "exori",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps the largest schema-valid bot configuration within the transport cap", () => {
    const rules = Array.from({ length: 12 }, (_, index) => ({
      id: String(index).padEnd(64, "r"),
      enabled: true,
      action: {
        kind: "spell" as const,
        spellId: String(index).padEnd(96, "s"),
        targetMode: "attack-target" as const,
        parameter: String(index).padEnd(64, "p"),
      },
      trigger: {
        kind: "condition-missing" as const,
        condition: "magic-shield" as const,
      },
      unequipWhenInactive: true,
    }));
    const serialized = JSON.stringify({
      type: "update-action-bot",
      settings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules,
      },
    });

    expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(
      PROTOCOL_LIMITS.maxMessageBytes,
    );
  });

  it("keeps the largest schema-valid action bar within the transport cap", () => {
    const actionBar = createDefaultActionBar().map((slot, index) => ({
      ...slot,
      action: {
        kind: "text" as const,
        text: "\ud800".repeat(96),
        sendAutomatically: true,
      },
      hotkey: `Alt+Control+Meta+Shift+${String(index).padEnd(41, "K")}`,
    }));
    const serialized = JSON.stringify({
      type: "update-action-bar",
      actionBar,
    });

    expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(
      PROTOCOL_LIMITS.maxMessageBytes,
    );
  });
});
