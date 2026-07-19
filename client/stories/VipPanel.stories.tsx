import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { VipEntry } from "@tibia/protocol";
import { VipPanel } from "../components/social/VipPanel";

const ENTRIES: VipEntry[] = [
  {
    characterId: "00000000-0000-4000-8000-000000000001",
    name: "Mirella",
    online: true,
    description: "Hunt partner",
    icon: 4,
    notifyLogin: true,
  },
  {
    characterId: "00000000-0000-4000-8000-000000000002",
    name: "Thorgal",
    online: true,
    description: "",
    icon: 0,
    notifyLogin: false,
  },
  {
    characterId: "00000000-0000-4000-8000-000000000003",
    name: "Elyra",
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
    error: null,
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
