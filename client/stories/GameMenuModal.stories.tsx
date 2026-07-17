import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { GameMenuModal } from "../components/settings/GameMenuModal";

const meta = {
  title: "GameMenuModal",
  component: GameMenuModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onClose: fn(),
    onChangeCharacter: fn(),
    onLogout: fn(),
    onChangeEmail: fn(),
    onChangePassword: fn(),
    diagonalWalking: true,
    onDiagonalWalkingChange: fn(),
  },
} satisfies Meta<typeof GameMenuModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Menu: Story = {};

export const Settings: Story = {
  args: {
    initialView: "settings",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("slider")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Diagonal walking/ }),
    );
    await expect(args.onDiagonalWalkingChange).toHaveBeenCalledWith(false);
  },
};

export const HotkeyMapping: Story = {
  args: {
    initialView: "hotkeys",
  },
};

export const ChangeEmail: Story = {
  args: {
    initialView: "email",
  },
};

export const ChangePassword: Story = {
  args: {
    initialView: "password",
  },
};
