import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { SpellIcon } from "../components/spells/SpellIcon";
import { getSpellIconArtwork } from "../lib/combat/getSpellIconArtwork";

function Row({ spellIds }: { spellIds: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-wrap gap-2 bg-ui-panel-deep p-4">
      {spellIds.map((id) => {
        const artwork = getSpellIconArtwork(id);
        return (
          <span key={id} title={id} data-spell-id={id}>
            {artwork && <SpellIcon {...artwork} />}
          </span>
        );
      })}
    </div>
  );
}

const meta = {
  title: "SpellIcon",
  component: Row,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spells whose icons OTClient ships on its 32×32 sheet. */
export const SheetIcons: Story = {
  args: {
    spellIds: [
      "exani-tera",
      "exani-hur",
      "utevo-res",
      "utevo-res-ina",
      "exeta-res",
      "exeta-amp-res",
      "exana-amp-res",
      "exevo-pan",
      "exori-kor",
      "exori-moe",
      "exori-mas-res",
      "utamo-tempo",
      "utani-tempo-hur",
      "utito-tempo",
      "uteta-tio",
      "utori-san",
      "exevo-ulus-frigo",
      "exevo-ulus-tera",
    ],
  },
};

/** Conjures OTClient never drew: they show the item they produce. */
export const ConjuredItems: Story = {
  args: { spellIds: ["adori-blank", "exevo-gran-con-grav"] },
  play: async ({ canvasElement }) => {
    const drawn = () =>
      canvasElement.querySelectorAll<HTMLElement>("[data-sprite-id]");

    await waitFor(() => expect(drawn()).toHaveLength(2), { timeout: 30_000 });
    await expect(
      [...drawn()].map((piece) => piece.dataset.spriteId),
    ).toEqual(["7614", "24886"]);
  },
};
