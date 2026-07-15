"use client";

import type { CharacterVocation } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { EffectArtwork } from "./EffectArtwork";
import { SPELL_LISTS } from "./spellLists";

interface SpellListModalProps {
  vocation: CharacterVocation;
  onClose: () => void;
}

export function SpellListModal({ vocation, onClose }: SpellListModalProps) {
  const { t } = useAppTranslation();
  const vocationName = t(`vocations.${vocation}.name`);
  const spells = SPELL_LISTS[vocation];

  return (
    <Modal
      title={t("spells.list.title", { vocation: vocationName })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-ui-gold/15 bg-black/25 px-3 py-2.5">
          <p className="text-xs leading-5 text-ui-muted">
            {t("spells.list.description", {
              vocation: vocationName,
              count: spells.length,
            })}
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {spells.map((spell) => (
            <li
              key={spell.id}
              className="flex items-center gap-3 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/55 p-3 shadow-inner shadow-black/35"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-accent-light/35 bg-ui-accent-deep/55 shadow-inner shadow-black/60">
                <EffectArtwork {...spell.artwork} />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-sm font-medium tracking-wide text-ui-text-bright">
                  {spell.name}
                </h3>
                <p className="truncate text-xs italic text-ui-muted">
                  {spell.words}
                </p>
              </div>

              <dl className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-[10px] leading-4">
                <div>
                  <dt className="tracking-wider text-ui-muted uppercase">
                    {t("spells.list.level")}
                  </dt>
                  <dd className="text-xs font-semibold tabular-nums text-ui-text">
                    {spell.requiredLevel}
                  </dd>
                </div>
                <div>
                  <dt className="tracking-wider text-ui-muted uppercase">
                    {t("spells.list.mana")}
                  </dt>
                  <dd className="text-xs font-semibold tabular-nums text-ui-mana-light">
                    {spell.manaCost ?? t("spells.list.variable")}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
