import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { GameMenuModal } from "../components/settings/GameMenuModal";

const meta = {
  title: "Game/Settings/GameMenuModal",
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
  },
} satisfies Meta<typeof GameMenuModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Menu: Story = {};

export const Settings: Story = {
  args: {
    initialView: "settings",
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
