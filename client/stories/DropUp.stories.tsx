import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DropUp, type DropUpOption } from "../components/ui/DropUp";
import { SpellIcon } from "../components/spells/SpellIcon";
import { SpriteIcon } from "../components/inventory/SpriteIcon";
import { getSpellIconArtwork } from "../lib/combat/getSpellIconArtwork";

function spellOption(
  id: string,
  label: string,
  description: string,
): DropUpOption<string> {
  const artwork = getSpellIconArtwork(id);
  return {
    value: `spell:${id}`,
    label,
    description,
    icon: artwork ? <SpellIcon {...artwork} /> : undefined,
    group: "Spells",
  };
}

const OPTIONS: ReadonlyArray<DropUpOption<string>> = [
  spellOption("exura", "Light Healing", "exura · 20 mana"),
  spellOption("exura-gran", "Intense Healing", "exura gran · 70 mana"),
  spellOption("utani-hur", "Haste", "utani hur · 60 mana"),
  spellOption("utani-gran-hur", "Strong Haste", "utani gran hur · 100 mana"),
  spellOption("exori-flam", "Flame Strike", "exori flam · 20 mana"),
  {
    value: "item:266",
    label: "health potion",
    icon: <SpriteIcon spriteId={5695} scale={1.25} />,
    group: "Carried objects",
  },
  {
    value: "item:268",
    label: "mana potion",
    icon: <SpriteIcon spriteId={5697} scale={1.25} />,
    group: "Carried objects",
  },
];

function InteractiveDropUp() {
  const [value, setValue] = useState("spell:utani-hur");

  return (
    <DropUp
      ariaLabel="Action for rule 1"
      label="Action"
      value={value}
      options={OPTIONS}
      searchLabel="Search spells and objects"
      emptyLabel="No matching spell or object"
      onChange={setValue}
    />
  );
}

const meta = {
  title: "DropUp",
  component: DropUp,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="ui-backdrop flex h-[32rem] w-80 items-end p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: "Action for rule 1",
    label: "Action",
    value: "spell:utani-hur",
    options: OPTIONS,
    searchLabel: "Search spells and objects",
    emptyLabel: "No matching spell or object",
    onChange: () => undefined,
  },
} satisfies Meta<typeof DropUp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => <InteractiveDropUp />,
};

export const Disabled: Story = {
  args: { disabled: true },
};
