import {
  clientMessageSchema,
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  PROTOCOL_LIMITS,
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
        slotIndex: 9,
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

function actionBar() {
  return createDefaultActionBar().map((slot, index) =>
    index === 9
      ? {
          ...slot,
          action: {
            kind: "item" as const,
            itemTypeId: 239,
            mode: "use-on-self" as const,
          },
        }
      : slot,
  );
}

describe("action bot intent schema", () => {
  it("accepts a bounded server-evaluated rule", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bar",
        actionBar: actionBar(),
        settings: settings(45),
      }).success,
    ).toBe(true);
  });

  it.each([0, 100, 50.5])(
    "rejects an out-of-range threshold of %s",
    (percent) => {
      expect(
        clientMessageSchema.safeParse({
          type: "update-action-bar",
          actionBar: actionBar(),
          settings: settings(percent),
        }).success,
      ).toBe(false);
    },
  );

  it("rejects extra client-authored outcome fields", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-action-bar",
        actionBar: actionBar(),
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
        type: "update-action-bar",
        actionBar: actionBar(),
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

  it("keeps the largest schema-valid configuration within the transport cap", () => {
    const actionBar = createDefaultActionBar().map((slot, index) => ({
      ...slot,
      action: {
        kind: "text" as const,
        text: "\ud800".repeat(96),
        sendAutomatically: true,
      },
      hotkey: `Alt+Control+Meta+Shift+${String(index).padEnd(41, "K")}`,
    }));
    const rules = Array.from({ length: 12 }, (_, index) => ({
      id: String(index).padEnd(64, "r"),
      enabled: true,
      slotIndex: index,
      trigger: {
        kind: "condition-missing" as const,
        condition: "magic-shield" as const,
      },
      unequipWhenInactive: true,
    }));
    const serialized = JSON.stringify({
      type: "update-action-bar",
      actionBar,
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
});
