import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type {
  ItemTooltipData,
  LootFilterItem,
  BestiaryCreatureEntry,
  BestiaryMonsterStateMessage,
} from "@tibia/protocol";
import { expect, fn, userEvent, within } from "storybook/test";

import { LootFilterModal } from "../components/loot-filter/LootFilterModal";

const GOLD = 3031;
const AXE = 3274;
const CHICKEN_FEATHER = 5890;
const MEAT = 3577;
const WORM = 3492;

/** The server composes these; a story only needs enough of one to draw. */
function tooltip(
  name: string,
  spriteId: number,
  extra: Partial<ItemTooltipData> = {},
): ItemTooltipData {
  return {
    name,
    typeLine: "Item",
    spriteId,
    affixes: [],
    weight: 100,
    ...extra,
  };
}

/** Split by rolled grade, the way the server sends it. */
const carried: LootFilterItem[] = [
  {
    typeId: GOLD,
    name: "gold coin",
    spriteId: 3031,
    count: 214,
    tooltip: tooltip("Gold Coin", 3031, { typeLine: "Currency" }),
  },
  {
    typeId: AXE,
    name: "axe",
    spriteId: 3274,
    count: 1,
    // Carried gear shows the grade it actually rolled, not five hypotheticals.
    tooltip: tooltip("Axe", 3274, {
      typeLine: "Axe Weapons",
      rarity: "legendary",
      primaryStat: "Attack 25 · Defense 19",
    }),
  },
  {
    typeId: AXE,
    name: "axe",
    spriteId: 3274,
    count: 2,
    tooltip: tooltip("Axe", 3274, {
      typeLine: "Axe Weapons",
      rarity: "common",
      primaryStat: "Attack 25 · Defense 19",
    }),
  },
  {
    typeId: MEAT,
    name: "meat",
    spriteId: 3577,
    count: 7,
    tooltip: tooltip("Meat", 3577, { typeLine: "Food" }),
  },
  {
    typeId: CHICKEN_FEATHER,
    name: "chicken feather",
    spriteId: 5890,
    count: 3,
    tooltip: tooltip("Chicken Feather", 5890),
  },
];

const ROTWORM_OUTFIT = {
  lookType: 26,
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
};

const creatures: BestiaryCreatureEntry[] = [
  {
    raceId: 111,
    name: "Rotworm",
    className: "Vermin",
    outfit: ROTWORM_OUTFIT,
    stage: 2,
    kills: 120,
  },
];

const monster: BestiaryMonsterStateMessage = {
  type: "bestiary-monster-state",
  raceId: 111,
  name: "Rotworm",
  className: "Vermin",
  outfit: ROTWORM_OUTFIT,
  stage: 2,
  kills: 120,
  firstUnlock: 25,
  secondUnlock: 250,
  toKill: 500,
  stars: 1,
  occurrence: 0,
  charmPoints: 5,
  loot: [
    {
      itemTypeId: MEAT,
      spriteId: 3577,
      name: "meat",
      rarity: 0,
      tooltip: tooltip("Meat", 3577, { typeLine: "Food" }),
    },
    {
      itemTypeId: WORM,
      spriteId: 3492,
      name: "worm",
      rarity: 1,
      tooltip: tooltip("Worm", 3492),
    },
  ],
  stats: {
    maxHealth: 65,
    experience: 40,
    speed: 100,
    armor: 10,
    mitigation: 1,
  },
  resistances: [],
  locations: "Rookgaard sewers",
};

/** One ungraded entry per type carried or listed; what the search reads. */
const TYPES: LootFilterItem[] = [
  {
    typeId: GOLD,
    name: "gold coin",
    spriteId: 3031,
    tooltip: tooltip("Gold Coin", 3031, { typeLine: "Currency" }),
  },
  {
    typeId: AXE,
    name: "axe",
    spriteId: 3274,
    tooltip: tooltip("Axe", 3274, {
      typeLine: "Axe Weapons",
      rarity: "common",
      primaryStat: "Attack 25 · Defense 19",
    }),
  },
  {
    typeId: MEAT,
    name: "meat",
    spriteId: 3577,
    tooltip: tooltip("Meat", 3577, { typeLine: "Food" }),
  },
  {
    typeId: CHICKEN_FEATHER,
    name: "chicken feather",
    spriteId: 5890,
    tooltip: tooltip("Chicken Feather", 5890),
  },
  {
    typeId: WORM,
    name: "worm",
    spriteId: 3492,
    tooltip: tooltip("Worm", 3492),
  },
];

const meta = {
  title: "LootFilterModal",
  component: LootFilterModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    filter: {
      enabled: true,
      pickupRules: [{ typeId: GOLD }, { typeId: AXE, rarities: ["legendary"] }],
    },
    carried,
    types: TYPES,
    creatures,
    monster,
    monsterPending: false,
    onRequestMonster: fn(),
    onChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof LootFilterModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    filter: { enabled: false, pickupRules: [] },
    carried: [],
    types: [],
    monster: null,
  },
};

/**
 * A listed type still in the backpacks shows in both panes — checked on the
 * left, listed on the right — and clicking either copy takes it back off.
 */
export const RemovesAListedType: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const listPane = within(
      canvas.getByRole("region", { name: "Pick up list" }),
    );
    await expect(
      within(
        canvas.getByRole("region", { name: "Loot in your backpacks" }),
      ).getByRole("button", { name: "Stop picking up gold coin" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      listPane.getByRole("button", { name: "Stop picking up gold coin" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith({
      enabled: true,
      pickupRules: [{ typeId: AXE, rarities: ["legendary"] }],
    });
  },
};

/** Gear that rolls a grade offers one cell per grade, chosen independently. */
export const PicksOneRarityOfAnItem: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText("Search every creature drop…"),
      "axe",
    );
    const results = within(
      canvas.getByRole("region", { name: "Search results" }),
    );
    await expect(
      results.getByRole("button", { name: "Stop picking up Legendary axe" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      results.getByRole("button", { name: "Pick up Rare axe" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith({
      enabled: true,
      pickupRules: [
        { typeId: GOLD },
        { typeId: AXE, rarities: ["rare", "legendary"] },
      ],
    });
  },
};

/** A creature's drop table is browsable straight into the pick-up list. */
export const AddsADropFromACreature: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText("Search a creature…"),
      "rot",
    );
    await userEvent.click(canvas.getByRole("button", { name: /Rotworm/ }));
    const drops = within(
      canvas.getByRole("region", { name: "Creature drops" }),
    );
    await userEvent.click(drops.getByRole("button", { name: "Pick up meat" }));
    await expect(args.onChange).toHaveBeenCalledWith({
      enabled: true,
      pickupRules: [
        { typeId: GOLD },
        { typeId: AXE, rarities: ["legendary"] },
        { typeId: MEAT },
      ],
    });
  },
};

/** The panel shows one thing at a time; back returns to the creature list. */
export const ReturnsFromADropTable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText("Search a creature…"),
      "rot",
    );
    await userEvent.click(canvas.getByRole("button", { name: /Rotworm/ }));
    const drops = within(
      canvas.getByRole("region", { name: "Creature drops" }),
    );
    await expect(
      drops.queryByRole("button", { name: /Rotworm/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(drops.getByRole("button", { name: "Back" }));
    await expect(
      drops.getByRole("button", { name: /Rotworm/ }),
    ).toBeInTheDocument();
    await expect(
      drops.queryByRole("button", { name: "Pick up meat" }),
    ).not.toBeInTheDocument();
  },
};

/** Clearing the creature search clears what it turned up. */
export const ClearingTheCreatureSearchClearsResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByPlaceholderText("Search a creature…");
    await userEvent.type(search, "rot");
    await userEvent.click(canvas.getByRole("button", { name: /Rotworm/ }));
    await userEvent.clear(search);
    const drops = within(
      canvas.getByRole("region", { name: "Creature drops" }),
    );
    await expect(
      drops.queryByRole("button", { name: /Rotworm/ }),
    ).not.toBeInTheDocument();
    await expect(
      drops.getByText("Search a creature to browse what it drops."),
    ).toBeInTheDocument();
  },
};

/** Carried gear lists the grade it rolled, not the five it could have. */
export const CarriedGearShowsItsOwnGrade: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bags = within(
      canvas.getByRole("region", { name: "Loot in your backpacks" }),
    );
    await expect(
      bags.getByRole("button", { name: "Stop picking up Legendary axe" }),
    ).toBeInTheDocument();
    await expect(
      bags.getByRole("button", { name: "Pick up Common axe" }),
    ).toBeInTheDocument();
    await expect(
      bags.queryByRole("button", { name: "Pick up Epic axe" }),
    ).not.toBeInTheDocument();
  },
};
