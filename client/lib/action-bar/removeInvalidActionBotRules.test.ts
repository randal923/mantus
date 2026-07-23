import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  type ActionBotSettings,
} from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { removeInvalidActionBotRules } from "./removeInvalidActionBotRules";

describe("removeInvalidActionBotRules", () => {
  it("removes rules whose action was cleared or changed to text", () => {
    const actionBar = createDefaultActionBar();
    actionBar[0] = {
      ...actionBar[0]!,
      action: {
        kind: "spell",
        spellId: "exura",
        targetMode: "self",
      },
    };
    actionBar[1] = {
      ...actionBar[1]!,
      action: {
        kind: "text",
        text: "hi",
        sendAutomatically: true,
      },
    };
    const settings: ActionBotSettings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "valid",
          enabled: true,
          slotIndex: 0,
          trigger: {
            kind: "resource-below",
            resource: "health",
            percent: 70,
          },
          unequipWhenInactive: false,
        },
        {
          id: "text",
          enabled: true,
          slotIndex: 1,
          trigger: { kind: "target-present" },
          unequipWhenInactive: false,
        },
        {
          id: "empty",
          enabled: true,
          slotIndex: 2,
          trigger: { kind: "target-present" },
          unequipWhenInactive: false,
        },
      ],
    };

    expect(removeInvalidActionBotRules(settings, actionBar).rules).toEqual([
      settings.rules[0],
    ]);
  });

  it("preserves the existing settings object when every rule remains valid", () => {
    const actionBar = createDefaultActionBar();
    actionBar[0] = {
      ...actionBar[0]!,
      action: {
        kind: "spell",
        spellId: "exura",
        targetMode: "self",
      },
    };
    const settings: ActionBotSettings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "valid",
          enabled: true,
          slotIndex: 0,
          trigger: {
            kind: "resource-below",
            resource: "health",
            percent: 70,
          },
          unequipWhenInactive: false,
        },
      ],
    };

    expect(removeInvalidActionBotRules(settings, actionBar)).toBe(settings);
  });
});
