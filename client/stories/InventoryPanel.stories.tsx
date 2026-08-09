import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OwnCharacterState } from "@tibia/protocol";
import { expect, fireEvent, fn, within } from "storybook/test";
import { InventoryPanel } from "../components/inventory/InventoryPanel";
import type { Equipment } from "../components/inventory/inventoryTypes";
import { makeInventoryItem } from "./makeInventoryItem";

const equipment: Equipment = {
  backpack: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000001",
    clientId: 2854,
    spriteId: 7137,
    name: "Backpack",
    count: 1,
    equipmentSlot: "backpack",
  }),
  weapon: makeInventoryItem({
    id: "00000000-0000-4000-8000-000000000002",
    clientId: 3273,
    spriteId: 7742,
    name: "Sabre",
    count: 1,
    equipmentSlot: "weapon",
  }),
};

const items = [
  {
    slot: 0,
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000003",
      clientId: 3031,
      spriteId: 7384,
      name: "Gold Coin",
      count: 100,
    }),
  },
  {
    slot: 1,
    item: makeInventoryItem({
      id: "00000000-0000-4000-8000-000000000004",
      clientId: 266,
      spriteId: 4358,
      name: "Health Potion",
      count: 5,
    }),
  },
];

const nestedBackpack = makeInventoryItem({
  id: "00000000-0000-4000-8000-000000000005",
  clientId: 2869,
  spriteId: 7152,
  name: "Blue Backpack",
  count: 1,
  useKind: "container",
  containerCapacity: 4,
});

const nestedItem = makeInventoryItem({
  id: "00000000-0000-4000-8000-000000000006",
  clientId: 3003,
  spriteId: 7355,
  name: "Rope",
  count: 1,
});

const deeplyNestedBackpack = makeInventoryItem({
  id: "00000000-0000-4000-8000-000000000007",
  clientId: 2870,
  spriteId: 7145,
  name: "Green Backpack",
  count: 1,
  useKind: "container",
  containerCapacity: 8,
});

const boundTrunk = makeInventoryItem({
  id: "00000000-0000-4000-8000-000000000008",
  clientId: 23396,
  spriteId: 7137,
  name: "bound items",
  count: 1,
  useKind: "container",
  containerCapacity: 500,
});

const lootPouch = makeInventoryItem({
  id: "00000000-0000-4000-8000-000000000009",
  clientId: 23721,
  spriteId: 7137,
  name: "Loot Pouch",
  count: 1,
  useKind: "container",
  containerCapacity: 500,
});

const character: OwnCharacterState = {
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
  title: "InventoryPanel",
  component: InventoryPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-dvh items-start justify-center p-6">
        <div className="h-full w-full max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    onClose: fn(),
    onStack: fn(),
    onSort: fn(),
    onToggleCharacterStats: fn(),
  },
} satisfies Meta<typeof InventoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Knight: Story = {
  args: {
    characterName: "Deceius",
    character,
    equipment,
    items,
    capacityUsed: 214,
    capacityMax: 400,
    slotCount: 20,
  },
};

export const CharacterDetails: Story = {
  args: {
    ...Knight.args,
    characterStatsOpen: true,
  },
};

export const DropsAnywhereIntoFirstBackpackSlot: Story = {
  args: {
    ...Knight.args,
    onDropInContainer: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const inventory = canvas.getByRole("region", {
      name: "Deceius's inventory",
    });

    fireEvent.drop(inventory);
    fireEvent.drop(canvas.getByTitle("5 Health Potion"));

    await expect(args.onDropInContainer).toHaveBeenNthCalledWith(
      1,
      equipment.backpack,
      0,
      "front",
    );
    await expect(args.onDropInContainer).toHaveBeenNthCalledWith(
      2,
      equipment.backpack,
      0,
      "front",
    );
  },
};

export const GroundDropReachesRendererCleanup: Story = {
  args: {
    ...Knight.args,
    onDropInContainer: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const rendererCleanup = fn();
    window.addEventListener("pointerup", rendererCleanup);
    try {
      fireEvent.pointerUp(canvas.getByTitle("5 Health Potion"), { button: 0 });
    } finally {
      window.removeEventListener("pointerup", rendererCleanup);
    }

    await expect(args.onDropInContainer).toHaveBeenCalledTimes(1);
    await expect(rendererCleanup).toHaveBeenCalledTimes(1);
  },
};

export const NavigatesBackpacksAndDropsInsideThem: Story = {
  args: {
    ...Knight.args,
    items: [
      { slot: 0, item: nestedBackpack },
      { slot: 1, item: items[1]!.item },
    ],
    containers: [
      {
        container: nestedBackpack,
        parentContainerId: equipment.backpack!.id,
        capacity: 4,
        items: [{ slot: 0, item: nestedItem }],
      },
    ],
    onOpenContainer: fn(),
    onCloseContainer: fn(),
    onDropInContainer: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const backpackItem = canvas.getByTitle("Blue Backpack");

    fireEvent.drop(backpackItem);
    await expect(args.onDropInContainer).toHaveBeenCalledWith(
      nestedBackpack,
      0,
      "front",
    );

    fireEvent.drop(canvas.getByTitle("Backpack"));
    await expect(args.onDropInContainer).toHaveBeenCalledWith(
      equipment.backpack,
      0,
      "front",
    );

    fireEvent.contextMenu(backpackItem);
    await expect(args.onOpenContainer).toHaveBeenCalledWith(nestedBackpack);
    await expect(
      canvas.getByRole("heading", { name: "Blue Backpack" }),
    ).toBeInTheDocument();
    await expect(canvas.getByTitle("Rope")).toBeInTheDocument();
    await expect(canvas.queryByTitle("5 Health Potion")).not.toBeInTheDocument();

    fireEvent.contextMenu(canvas.getByTitle("Backpack"));
    await expect(args.onCloseContainer).toHaveBeenCalledWith(
      nestedBackpack.id,
    );
    await expect(
      canvas.getByRole("heading", { name: "Backpack" }),
    ).toBeInTheDocument();
    await expect(canvas.getByTitle("5 Health Potion")).toBeInTheDocument();
  },
};

export const OpensExactBackpackWithoutFlashingPreviousItems: Story = {
  args: {
    ...Knight.args,
    items: [
      { slot: 0, item: nestedBackpack },
      { slot: 1, item: items[1]!.item },
    ],
    containers: [
      {
        container: nestedBackpack,
        parentContainerId: equipment.backpack!.id,
        capacity: 4,
        items: [
          { slot: 0, item: deeplyNestedBackpack },
          { slot: 1, item: nestedItem },
        ],
      },
    ],
    onOpenContainer: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    fireEvent.contextMenu(canvas.getByTitle("Blue Backpack"));
    await expect(canvas.getByTitle("Rope")).toBeInTheDocument();

    fireEvent.contextMenu(canvas.getByTitle("Green Backpack"));
    await expect(
      canvas.getByRole("heading", { name: "Green Backpack" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByTitle("Rope")).not.toBeInTheDocument();
    await expect(canvas.queryByTitle("5 Health Potion")).not.toBeInTheDocument();
  },
};

export const BoundTrunkRendersOnlyUsedRows: Story = {
  args: {
    ...Knight.args,
    equipment: { ...equipment, bound: boundTrunk },
    containers: [
      {
        container: boundTrunk,
        parentContainerId: null,
        capacity: 500,
        items: [{ slot: 0, item: lootPouch }],
      },
    ],
    onOpenContainer: fn(),
    onCloseContainer: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    fireEvent.contextMenu(canvas.getByRole("button", { name: "Bound items" }));
    await expect(
      canvas.getByRole("heading", { name: "bound items" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("1 / ∞")).toBeInTheDocument();

    // The 500-slot trunk draws the row its contents need plus one fully
    // open row — enough to read as infinite, never the whole grid.
    const grid = canvasElement.querySelector(
      ".ui-scrollbar .grid.justify-items-center",
    );
    await expect(grid?.children).toHaveLength(8);

    // Empty trunk slots draw open like the pouch's even though they take no
    // drops — only the server fills them.
    await expect(grid?.querySelectorAll("button:disabled")).toHaveLength(0);

    // Browse into the pouch before any server confirm (it has no entry in
    // `containers`): the stack/sort row must survive that frame so the
    // capacity bar does not jump while the container opens.
    fireEvent.contextMenu(canvas.getByTitle("Loot Pouch"));
    await expect(
      canvas.getByRole("heading", { name: "Loot Pouch" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("0 / ∞")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Stack" }),
    ).toBeInTheDocument();
  },
};

export const FreshCharacter: Story = {
  args: {
    characterName: "Newbie",
    equipment: {},
    items: [],
    capacityUsed: 0,
    capacityMax: 400,
    slotCount: 0,
  },
};
