import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { VipEntry } from "@tibia/protocol";
import { VipPanel } from "../components/social/VipPanel";

const ENTRIES: VipEntry[] = [
  {
    characterId: "00000000-0000-4000-8000-000000000001",
    name: "Mirella",
    level: 84,
    vocation: "Royal Paladin",
    online: true,
    description: "Hunt partner",
    icon: 4,
    notifyLogin: true,
  },
  {
    characterId: "00000000-0000-4000-8000-000000000002",
    name: "Thorgal",
    level: 61,
    vocation: "Elite Knight",
    online: true,
    description: "",
    icon: 0,
    notifyLogin: false,
  },
  {
    characterId: "00000000-0000-4000-8000-000000000003",
    name: "Elyra",
    level: 52,
    vocation: "Master Sorcerer",
    online: false,
    description: "Guild banker",
    icon: 7,
    notifyLogin: false,
  },
];

const meta = {
  title: "Game/VipPanel",
  component: VipPanel,
  args: {
    entries: ENTRIES,
    pending: false,
    error: null,
    hasParty: false,
    onOpenParty: fn(),
    onAdd: fn(),
    onEdit: fn(),
    onRemove: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof VipPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {};

export const Empty: Story = {
  args: { entries: [] },
};

export const WithError: Story = {
  args: { error: "That character is already on your list." },
};
