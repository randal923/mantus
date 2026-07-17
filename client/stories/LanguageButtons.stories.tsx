import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { LanguageButtons } from "../components/auth/LanguageButtons";

const meta = {
  title: "LanguageButtons",
  component: LanguageButtons,
  parameters: { layout: "centered" },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof LanguageButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {
  args: { language: "en" },
};

export const Portuguese: Story = {
  args: { language: "pt-BR" },
};

export const Disabled: Story = {
  args: { language: "en", disabled: true },
};
