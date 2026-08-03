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
  experience: 1_842_000,
  experienceForCurrentLevel: 1_780_000,
  experienceForNextLevel: 1_920_000,
  experienceRate: {
    basePercent: 500,
    xpBoostPercent: 50,
    xpBoostRemainingMs: 1_800_000,
    staminaPercent: 150,
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

      // Above the bar the pointer is on, and inside the scrolling panel.
      const box = tooltip.getBoundingClientRect();
      const bounds = scroller!.getBoundingClientRect();
      await expect(box.bottom).toBeLessThanOrEqual(
        bar.getBoundingClientRect().top,
      );
      await expect(box.top).toBeGreaterThanOrEqual(bounds.top);
      await expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);

      await userEvent.unhover(bar);
      await waitFor(() => expect(within(row).queryByText(percent)).toBeNull());
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
