import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Dropdown } from "../components/ui/Dropdown";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Português" },
] as const;

function InteractiveDropdown() {
  const [language, setLanguage] = useState<"en" | "pt-BR">("en");

  return (
    <Dropdown
      ariaLabel="Language"
      label="Language"
      value={language}
      options={LANGUAGE_OPTIONS}
      onChange={setLanguage}
    />
  );
}

const meta = {
  title: "Dropdown",
  component: Dropdown,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="ui-backdrop w-72 p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: "Language",
    label: "Language",
    value: "en",
    options: LANGUAGE_OPTIONS,
    onChange: () => undefined,
  },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => <InteractiveDropdown />,
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
