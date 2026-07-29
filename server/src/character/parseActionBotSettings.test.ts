import { describe, expect, it } from "vitest";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
} from "@tibia/protocol";
import { parseActionBar } from "./parseActionBar";
import { parseActionBotSettings } from "./parseActionBotSettings";

describe("unified action bar persistence parsing", () => {
  it("keeps the current action and bot settings shapes", () => {
    const actionBar = createDefaultActionBar().map((slot, index) =>
      index === 0
        ? {
            ...slot,
            action: {
              kind: "text" as const,
              text: "hi",
              sendAutomatically: false,
            },
          }
        : slot,
    );
    const settings = {
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "attack",
          enabled: true,
          action: {
            kind: "spell" as const,
            spellId: "exori",
            targetMode: "direction" as const,
          },
          trigger: { kind: "target-present" as const },
          unequipWhenInactive: false,
        },
      ],
    };

    expect(parseActionBar(actionBar)).toEqual(actionBar);
    expect(
      parseActionBotSettings({ botSettings: settings }, actionBar),
    ).toEqual(settings);
  });

  it("upgrades the former spell and potion rows with auto-potion rules", () => {
    const legacySpells = ["exura ico"];
    const legacyPotions = {
      slots: [
        { itemTypeId: 266, targetMode: "self" as const },
        { itemTypeId: 268, targetMode: "crosshair" as const },
      ],
      autoPotionSettings: {
        enabled: true,
        health: { itemTypeId: 266, thresholdPercent: 45 },
        mana: { itemTypeId: 268, thresholdPercent: 30 },
        priority: "mana" as const,
      },
    };
    const actionBar = parseActionBar(legacySpells, legacyPotions);

    expect(actionBar[0]?.action).toEqual({
      kind: "spell",
      spellId: "exura ico",
      targetMode: "attack-target",
    });
    expect(actionBar[9]?.action).toEqual({
      kind: "item",
      itemTypeId: 266,
      mode: "use-on-self",
    });
    expect(actionBar[10]?.action).toEqual({
      kind: "item",
      itemTypeId: 268,
      mode: "use-with-crosshair",
    });
    expect(parseActionBotSettings(legacyPotions, actionBar)).toEqual({
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "legacy-mana",
          enabled: true,
          action: {
            kind: "item",
            itemTypeId: 268,
            mode: "use-with-crosshair",
          },
          trigger: {
            kind: "resource-below",
            resource: "mana",
            percent: 30,
          },
          unequipWhenInactive: false,
        },
        {
          id: "legacy-health",
          enabled: true,
          action: {
            kind: "item",
            itemTypeId: 266,
            mode: "use-on-self",
          },
          trigger: {
            kind: "resource-below",
            resource: "health",
            percent: 45,
          },
          unequipWhenInactive: false,
        },
      ],
    });
  });

  it("moves legacy support rules out of action bar slots", () => {
    const actionBar = createDefaultActionBar();
    actionBar[0] = {
      ...actionBar[0]!,
      action: {
        kind: "spell",
        spellId: "utani-gran-hur",
        targetMode: "self",
      },
    };
    actionBar[1] = {
      ...actionBar[1]!,
      action: {
        kind: "spell",
        spellId: "utamo-vita",
        targetMode: "self",
      },
    };

    expect(
      parseActionBotSettings(
        {
          botSettings: {
            enabled: true,
            rules: [
              {
                id: "legacy-haste",
                enabled: true,
                slotIndex: 0,
                trigger: {
                  kind: "condition-missing",
                  condition: "haste",
                },
                unequipWhenInactive: false,
              },
              {
                id: "legacy-utamo",
                enabled: true,
                slotIndex: 1,
                trigger: {
                  kind: "condition-missing",
                  condition: "magic-shield",
                },
                unequipWhenInactive: false,
              },
            ],
          },
        },
        actionBar,
      ),
    ).toEqual({
      enabled: true,
      autoHaste: {
        enabled: true,
        spellId: "utani-gran-hur",
      },
      autoUtamoVita: true,
      rules: [],
    });
  });

  it("resolves rules persisted as action bar slots into their own actions", () => {
    const actionBar = createDefaultActionBar();
    actionBar[3] = {
      ...actionBar[3]!,
      action: { kind: "item", itemTypeId: 266, mode: "use-on-self" },
    };

    expect(
      parseActionBotSettings(
        {
          botSettings: {
            enabled: true,
            rules: [
              {
                id: "heal",
                enabled: true,
                slotIndex: 3,
                trigger: {
                  kind: "resource-below",
                  resource: "health",
                  percent: 40,
                },
                unequipWhenInactive: false,
              },
              {
                id: "dangling",
                enabled: true,
                slotIndex: 7,
                trigger: { kind: "target-present" },
                unequipWhenInactive: false,
              },
            ],
          },
        },
        actionBar,
      ),
    ).toEqual({
      ...DEFAULT_ACTION_BOT_SETTINGS,
      enabled: true,
      rules: [
        {
          id: "heal",
          enabled: true,
          action: { kind: "item", itemTypeId: 266, mode: "use-on-self" },
          trigger: {
            kind: "resource-below",
            resource: "health",
            percent: 40,
          },
          unequipWhenInactive: false,
        },
      ],
    });
  });

  it("fails closed when persisted settings are malformed", () => {
    expect(
      parseActionBotSettings(
        {
          botSettings: {
            enabled: true,
            rules: [{ slotIndex: 999 }],
          },
        },
        createDefaultActionBar(),
      ),
    ).toEqual({ ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] });
  });
});
