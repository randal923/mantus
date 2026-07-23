import type {
  CharacterVocation,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getSpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { Modal } from "../ui/Modal";
import { SpellIcon } from "./SpellIcon";

interface SpellListModalProps {
  vocation: CharacterVocation;
  spells: ReadonlyArray<SpellCatalogEntry>;
  onClose: () => void;
}

export function SpellListModal({
  vocation,
  spells,
  onClose,
}: SpellListModalProps) {
  const { t } = useAppTranslation();
  const vocationName = t(`vocations.${vocation}.name`);

  return (
    <Modal
      title={t("spells.list.title", { vocation: vocationName })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-ui-gold/15 bg-black/25 px-3 py-2.5">
          <p className="text-sm leading-6 text-ui-muted">
            {t("spells.list.description", {
              vocation: vocationName,
              count: spells.length,
            })}
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {spells.map((spell) => {
            const iconArtwork = getSpellIconArtwork(spell.id);

            return (
              <li
                key={spell.id}
                className="flex items-center gap-3 rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/55 p-3 shadow-inner shadow-black/35"
              >
                <div className="flex size-12 shrink-0 items-center justify-center">
                  {iconArtwork && <SpellIcon {...iconArtwork} />}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-sm font-medium tracking-wide text-ui-text-bright">
                    {spell.name}
                  </h3>
                  <p className="truncate text-sm italic text-ui-muted">
                    {spell.words ?? "—"}
                  </p>
                </div>

                <dl className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-xs leading-5">
                  <div>
                    <dt className="tracking-wider text-ui-muted uppercase">
                      {t("spells.list.level")}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-ui-text">
                      {spell.requiredLevel}
                    </dd>
                  </div>
                  <div>
                    <dt className="tracking-wider text-ui-muted uppercase">
                      {t("spells.list.mana")}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-ui-mana-light">
                      {spell.manaCost}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
