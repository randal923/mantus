import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { LootFilterItem } from "@tibia/protocol";
import { expect, fn, userEvent, within } from "storybook/test";

import { LootFilterModal } from "../components/loot-filter/LootFilterModal";

const GOLD = 3031;
const AXE = 3274;
const CHICKEN_FEATHER = 5890;
const MEAT = 3577;
const WORM = 3492;

const carried: LootFilterItem[] = [
  { typeId: GOLD, name: "gold coin", spriteId: 3031, count: 214 },
  { typeId: AXE, name: "axe", spriteId: 3274, count: 2 },
  { typeId: MEAT, name: "meat", spriteId: 3577, count: 7 },
  { typeId: CHICKEN_FEATHER, name: "chicken feather", spriteId: 5890, count: 3 },
];

const meta = {
  title: "LootFilterModal",
  component: LootFilterModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    filter: { enabled: true, ignoredItemTypeIds: [MEAT, CHICKEN_FEATHER] },
    carried,
    ignored: [{ typeId: WORM, name: "worm", spriteId: 3492 }],
    onChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof LootFilterModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    filter: { enabled: false, ignoredItemTypeIds: [] },
    carried: [],
    ignored: [],
  },
};

/**
 * A blacklisted type the character still carries shows in both panes — marked
 * with the red cross on the left, listed on the right — and clicking either
 * copy takes it back off the list.
 */
export const RemovesAnIgnoredType: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const ignoredPane = within(
      canvas.getByRole("region", { name: "Active filter (do not pick up)" }),
    );
    await expect(
      within(
        canvas.getByRole("region", { name: "Loot in your backpacks" }),
      ).getByRole("button", { name: "Pick up meat again" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      ignoredPane.getByRole("button", { name: "Pick up meat again" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith({
      enabled: true,
      ignoredItemTypeIds: [CHICKEN_FEATHER],
    });
  },
};

/** Searching reaches drops the character has never carried. */
export const SearchesEveryCreatureDrop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText("Search every creature drop…"),
      "axe",
    );
    await expect(
      canvas.getByRole("button", { name: "Stop picking up axe" }),
    ).toBeInTheDocument();
  },
};
