import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { CharacterCreationOptions } from "@tibia/protocol";
import { CreateCharacterForm } from "../components/characters/CreateCharacterForm";

const CREATION_OPTIONS: CharacterCreationOptions = {
  vocations: ["Knight", "Paladin", "Sorcerer", "Druid"],
  outfits: [
    { lookType: 128, label: "citizen-male" },
    { lookType: 136, label: "citizen-female" },
  ],
  maxCharacters: 5,
};

const meta = {
  title: "Game/Characters/CreateCharacterForm",
  component: CreateCharacterForm,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex min-h-dvh items-start justify-center p-6 font-tibia text-ui-text">
        <div className="ui-panel-frame w-full max-w-lg p-6">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    creationOptions: CREATION_OPTIONS,
    onCreate: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CreateCharacterForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstCharacter: Story = {
  args: { onCancel: undefined },
};

export const Creating: Story = {
  args: { busy: true },
};

export const NameTaken: Story = {
  args: { error: "A character with that name already exists." },
};
