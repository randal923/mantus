import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { InventoryCharacterStats } from "../components/inventory/InventoryCharacterStats";

const CHARACTER: OwnCharacterState = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Deceius",
  vocation: "Knight",
  definitionVersion: 1,
  level: 47,
  experience: "1842000",
  experienceForCurrentLevel: "1780000",
  experienceForNextLevel: "1920000",
  experienceRate: {
    basePercent: 500,
    xpBoostPercent: 50,
    xpBoostRemainingMs: 1_800_000,
    staminaPercent: 150,
    premiumPercent: 0,
    totalPercent: 1_125,
  },
  magicLevel: 8,
  manaSpent: 2_100,
  manaSpentForNextMagicLevel: 4_800,
  health: 720,
  maxHealth: 840,
  mana: 210,
  maxMana: 285,
  capacity: 1_550,
  soul: 78,
  maxSoul: 100,
  stamina: 2520,
  maxStamina: 2520,
  staminaBonusPercent: 100,
  speed: 156,
  attackSpeedMs: 2_000,
  healthRegeneration: { amount: 1, intervalMs: 6_000 },
  manaRegeneration: { amount: 2, intervalMs: 6_000 },
  soulRegeneration: { amount: 1, intervalMs: 120_000 },
  skills: [
    { skill: "fist", level: 18, tries: 12, triesForNextLevel: 106 },
    { skill: "club", level: 22, tries: 33, triesForNextLevel: 157 },
    { skill: "sword", level: 61, tries: 3_820, triesForNextLevel: 6_456 },
    { skill: "axe", level: 24, tries: 58, triesForNextLevel: 190 },
    { skill: "distance", level: 31, tries: 104, triesForNextLevel: 2_065 },
    { skill: "shielding", level: 58, tries: 2_018, triesForNextLevel: 9_702 },
    { skill: "fishing", level: 14, tries: 8, triesForNextLevel: 29 },
  ],
  equipmentBonuses: {
    magicLevel: 0,
    maxHealth: 0,
    maxMana: 0,
    capacity: 0,
    speed: 0,
    attackSpeedMs: 0,
  },
  outfit: {
    lookType: 128,
    head: 78,
    body: 68,
    legs: 58,
    feet: 76,
    addons: 0,
  },
  position: { x: 100, y: 100, z: 7 },
  direction: "south",
  townId: 1,
  lastLoginAt: null,
};

const meta = {
  title: "InventoryCharacterStats",
  component: InventoryCharacterStats,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh justify-center p-6 font-tibia text-ui-text">
        <div className="h-full w-full max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    character: CHARACTER,
    capacityUsed: 214,
  },
} satisfies Meta<typeof InventoryCharacterStats>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {};

/** Hovering a bar reveals its percentage, unclipped by the scroll container. */
export const ProgressTooltips: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvasElement.querySelector(".ui-scrollbar");
    await expect(scroller).not.toBeNull();

    // Top row and bottom row: the two rows nearest the clipping edges.
    // Percentages are what is *missing*: experience sits at 44%, fishing 27%.
    for (const [name, percent] of [
      ["Experience", "56%"],
      ["Fishing", "73%"],
    ]) {
      if (name === "Fishing") {
        scroller!.scrollTop = scroller!.scrollHeight;
      }
      const bar = canvas.getByRole("progressbar", { name });
      const row = bar.parentElement!;
      await userEvent.hover(bar);
      const tooltip = await within(row).findByText(percent);

      // Clear of the bar the pointer is on — above it when the panel has room
      // above, below it when it does not — and never outside the scroller.
      const box = tooltip.getBoundingClientRect();
      const barBox = bar.getBoundingClientRect();
      const bounds = scroller!.getBoundingClientRect();
      await expect(
        box.bottom <= barBox.top || box.top >= barBox.bottom,
      ).toBe(true);
      await expect(box.top).toBeGreaterThanOrEqual(bounds.top);
      await expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);

      await userEvent.unhover(bar);
      await waitFor(() => expect(within(row).queryByText(percent)).toBeNull());
    }
  },
};

/**
 * Gear that moves the numbers: boots of haste, a capacity imbuement, and a
 * skill/magic-level ring. Bonused stats are tinted and explain themselves on
 * hover as base + equipment.
 */
export const EquipmentBonuses: Story = {
  args: {
    character: {
      ...CHARACTER,
      speed: 176,
      capacity: 1_680,
      maxHealth: 890,
      boostedMagicLevel: 10,
      equipmentBonuses: {
        magicLevel: 2,
        maxHealth: 50,
        maxMana: 0,
        capacity: 130,
        speed: 20,
        attackSpeedMs: 0,
      },
      skills: CHARACTER.skills.map((skill) =>
        skill.skill === "sword"
          ? { ...skill, boostedLevel: skill.level + 5, equipmentBonus: 5 }
          : skill.skill === "shielding"
            ? { ...skill, boostedLevel: skill.level + 3, equipmentBonus: 2 }
            : skill,
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const speed = canvas.getByText("176");
    await userEvent.hover(speed);
    await within(speed.parentElement!).findByText("+20");
    await userEvent.unhover(speed);

    // Every breakdown must land fully inside the panel, which clips on both
    // axes because it scrolls vertically. The magic-level chip is the hard
    // case: it sits against the top edge, so its bubble has to flip below.
    const bounds = canvasElement
      .querySelector(".ui-scrollbar")!
      .getBoundingClientRect();
    for (const [chipText, termText] of [
      ["(+2)", "+2"],
      ["(+5)", "+5"],
    ]) {
      const chip = canvas.getByText(chipText);
      await userEvent.hover(chip);
      const tooltip = await within(chip.parentElement!).findByText(termText, {
        selector: "span",
      });
      const box = tooltip.getBoundingClientRect();
      await expect(box.left).toBeGreaterThanOrEqual(bounds.left);
      await expect(box.right).toBeLessThanOrEqual(bounds.right);
      await expect(box.top).toBeGreaterThanOrEqual(bounds.top);
      await expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
      await userEvent.unhover(chip);
    }
  },
};

export const MaxedMagicLevel: Story = {
  args: {
    character: {
      ...CHARACTER,
      magicLevel: 10,
      manaSpent: 0,
      manaSpentForNextMagicLevel: 0,
    },
  },
};

/** Premium character above 39h stamina: green bar, +50% experience. */
export const GreenStamina: Story = {
  args: {
    character: { ...CHARACTER, stamina: 2_460, staminaBonusPercent: 150 },
  },
};

/** Below the 14h band: red bar, halved experience. */
export const OrangeStamina: Story = {
  args: {
    character: { ...CHARACTER, stamina: 600, staminaBonusPercent: 50 },
  },
};
