import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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
    onChat: fn(),
    onEdit: fn(),
    onRemove: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof VipPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const addFriend = canvas.getByRole("button", { name: "Add Friend" });
    await expect(addFriend).toHaveClass("rounded-md");
    await expect(addFriend).not.toHaveClass("rounded-full");

    const chat = canvas.getByRole("button", {
      name: "Chat with Mirella",
    });
    const edit = canvas.getByRole("button", { name: "Edit Mirella" });
    const remove = canvas.getByRole("button", { name: "Remove Mirella" });

    for (const action of [chat, edit, remove]) {
      await expect(action).toHaveClass(
        "rounded-sm",
        "border-ui-stone-light/20",
      );
      await expect(action.querySelector("svg")).toHaveClass("size-5");
    }

    await userEvent.click(chat);
    await expect(args.onChat).toHaveBeenCalledWith("Mirella");

    await userEvent.click(edit);
    await expect(
      canvas.getByRole("button", { name: "Icon 0" }),
    ).toHaveClass("size-8", "rounded-sm");
  },
};

export const Empty: Story = {
  args: { entries: [] },
};

export const WithError: Story = {
  args: { error: "That character is already on your list." },
};
