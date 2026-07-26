"use client";

import { useMemo, useState } from "react";
import type {
  ProficiencyActionFailedReason,
  ProficiencySelection,
  ProficiencyStateMessage,
  ProficiencyWeaponState,
} from "@tibia/protocol";
import { useProficiencyCatalog } from "../../hooks/useProficiencyCatalog";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ProficiencyPerkLevelRow } from "./ProficiencyPerkLevelRow";
import { ProficiencyWeaponListItem } from "./ProficiencyWeaponListItem";

interface ProficiencyModalProps {
  proficiency: ProficiencyStateMessage | null;
  pending: boolean;
  error: ProficiencyActionFailedReason | null;
  /** Sends the full replacement of one weapon's perk picks. */
  onSelect: (
    proficiencyId: number,
    selections: ReadonlyArray<ProficiencySelection>,
  ) => void;
  onClose: () => void;
}

interface ProficiencyDraft {
  source: ProficiencyWeaponState | undefined;
  picks: ReadonlyMap<number, number>;
}

/**
 * Weapon proficiency window: tracked weapons on the left, the selected
 * weapon's perk table on the right. Picks are a local draft submitted as a
 * full replacement; the server re-validates unlocks at execution time.
 */
export function ProficiencyModal({
  proficiency,
  pending,
  error,
  onSelect,
  onClose,
}: ProficiencyModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const catalog = useProficiencyCatalog();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftState, setDraftState] = useState<ProficiencyDraft | null>(null);

  const profilesById = useMemo(
    () =>
      new Map(catalog.profiles.map((profile) => [profile.proficiencyId, profile])),
    [catalog.profiles],
  );
  const weapons = proficiency?.weapons ?? [];
  const weapon =
    weapons.find((entry) => entry.proficiencyId === selectedId) ??
    weapons[0] ??
    null;
  const profile = weapon ? (profilesById.get(weapon.proficiencyId) ?? null) : null;
  const weaponName = (entry: ProficiencyWeaponState) =>
    profilesById.get(entry.proficiencyId)?.name ?? `#${entry.proficiencyId}`;

  const serverPicks = useMemo(() => {
    const picks = new Map<number, number>();
    for (const selection of weapon?.selections ?? []) {
      picks.set(selection.level, selection.index);
    }
    return picks as ReadonlyMap<number, number>;
  }, [weapon]);
  const draft =
    draftState !== null && draftState.source === weapon
      ? draftState.picks
      : serverPicks;
  const setPick = (level: number, index: number | null) => {
    const picks = new Map(draft);
    if (index === null) picks.delete(level);
    else picks.set(level, index);
    setDraftState({ source: weapon ?? undefined, picks });
  };

  const dirty =
    draft.size !== serverPicks.size ||
    [...draft].some(([level, index]) => serverPicks.get(level) !== index);
  const applySelections = () => {
    if (!weapon) return;
    const selections = [...draft]
      .map(([level, index]) => ({ level, index }))
      .sort((left, right) => left.level - right.level);
    onSelect(weapon.proficiencyId, selections);
  };

  return (
    <Modal
      title={t("proficiency.title")}
      onClose={onClose}
      size="extra-wide"
      footer={
        <>
          <span className="mr-auto self-center text-sm">
            {error && (
              <span role="alert" className="text-ui-accent-light">
                {t(`proficiency.errors.${error}`, {
                  defaultValue: t("proficiency.errors.invalid-request"),
                })}
              </span>
            )}
          </span>
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() => setDraftState(null)}
          >
            {t("proficiency.revert")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!weapon || !dirty || pending}
            onClick={applySelections}
          >
            {t("proficiency.apply")}
          </Button>
        </>
      }
    >
      {weapons.length === 0 ? (
        <p className="py-12 text-center text-sm text-ui-muted">
          {proficiency ? t("proficiency.empty") : t("proficiency.loading")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside>
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("proficiency.weapons")}
            </h3>
            <ul className="ui-scrollbar mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible">
              {weapons.map((entry) => (
                <li key={entry.proficiencyId}>
                  <ProficiencyWeaponListItem
                    weapon={entry}
                    name={weaponName(entry)}
                    selected={entry.proficiencyId === weapon?.proficiencyId}
                    onSelect={() => setSelectedId(entry.proficiencyId)}
                  />
                </li>
              ))}
            </ul>
          </aside>

          <section className="min-w-0">
            {weapon && (
              <h3 className="font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
                {weaponName(weapon)}
              </h3>
            )}
            {catalog.pending && (
              <p className="py-12 text-center text-sm text-ui-muted">
                {t("proficiency.catalogLoading")}
              </p>
            )}
            {catalog.error && (
              <p role="alert" className="py-12 text-center text-sm text-red-300">
                {t("proficiency.catalogError")}
              </p>
            )}
            {!catalog.pending && !catalog.error && weapon && !profile && (
              <p className="py-12 text-center text-sm text-ui-muted">
                {t("proficiency.noProfile")}
              </p>
            )}
            {weapon && profile && (
              <div className="mt-3 flex flex-col gap-2">
                {profile.levels.map((level, levelIndex) => (
                  <ProficiencyPerkLevelRow
                    key={levelIndex}
                    levelIndex={levelIndex}
                    perks={level.perks}
                    unlocked={levelIndex < weapon.unlockedLevels}
                    unlockHint={
                      levelIndex === weapon.unlockedLevels &&
                      weapon.nextLevelExperience !== null
                        ? t("proficiency.unlocksAt", {
                            experience:
                              weapon.nextLevelExperience.toLocaleString(
                                language,
                              ),
                          })
                        : null
                    }
                    selectedIndex={draft.get(levelIndex) ?? null}
                    disabled={pending}
                    onPick={(index) => setPick(levelIndex, index)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
