"use client";

import { useMemo, useState } from "react";
import type {
  ProficiencyActionFailedReason,
  ProficiencySelection,
  ProficiencyStateMessage,
  ProficiencyWeaponState,
} from "@tibia/protocol";
import { useProficiencyCatalog } from "../../hooks/useProficiencyCatalog";
import { useProficiencySprites } from "../../hooks/useProficiencySprites";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatProficiencyExperience } from "../../lib/proficiency/formatProficiencyExperience";
import { formatProficiencyPerk } from "../../lib/proficiency/formatProficiencyPerk";
import { getProficiencyLevelPercents } from "../../lib/proficiency/getProficiencyLevelPercents";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { PixelImage } from "../ui/PixelImage";
import { ProficiencyLevelStar } from "./ProficiencyLevelStar";
import { ProficiencyPerkColumn } from "./ProficiencyPerkColumn";
import { ProficiencyPerkDetailCell } from "./ProficiencyPerkDetailCell";
import { ProficiencyWeaponTile } from "./ProficiencyWeaponTile";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

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
 * Weapon proficiency window rebuilt on the OTClient art: item panel with
 * the mastery emblem on the left, one starred XP column per perk level with
 * a per-column detail footer on the right. Picks are a local draft
 * submitted as a full replacement; the server re-validates unlocks at
 * execution time.
 */
export function ProficiencyModal({
  proficiency,
  pending,
  error,
  onSelect,
  onClose,
}: ProficiencyModalProps) {
  const { t } = useAppTranslation();
  const scale = PROFICIENCY_UI_SCALE;
  const language = useLanguageStore((state) => state.language);
  const catalog = useProficiencyCatalog();
  const sprites = useProficiencySprites();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
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

  const needle = query.trim().toLowerCase();
  const visibleWeapons = needle
    ? weapons.filter((entry) =>
        weaponName(entry).toLowerCase().includes(needle),
      )
    : weapons;

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

  // Always draw the full seven-column table like Tibia; weapons with fewer
  // perk levels just leave the trailing columns empty.
  const columnCount = Math.max(7, profile?.levels.length ?? 0);
  const columnIndexes = Array.from({ length: columnCount }, (_, i) => i);
  const percents = weapon
    ? getProficiencyLevelPercents(weapon, columnCount)
    : null;
  const masteryLevel = weapon ? Math.min(7, weapon.unlockedLevels) : 0;
  const weaponSpriteId = weapon
    ? (sprites.get(weapon.proficiencyId) ?? null)
    : null;
  const experienceLabel = weapon
    ? weapon.mastered
      ? weapon.experience.toLocaleString(language)
      : `${weapon.experience.toLocaleString(language)} / ${(
          weapon.nextLevelExperience ?? weapon.experience
        ).toLocaleString(language)}`
    : "";
  const unlockHint =
    weapon && weapon.nextLevelExperience !== null
      ? t("proficiency.unlocksAt", {
          experience: weapon.nextLevelExperience.toLocaleString(language),
        })
      : t("proficiency.locked");
  /** Tooltip spelling out one level's XP progress, shared by star + footer. */
  const levelTitle = (levelIndex: number) => {
    const level = percents?.perLevel[levelIndex];
    const label = t("proficiency.levelLabel", { level: levelIndex + 1 });
    if (!weapon || !level || level.required === null) {
      return levelIndex < (weapon?.unlockedLevels ?? 0) ? label : unlockHint;
    }
    if (level.remaining === 0) return t("proficiency.levelComplete", { label });
    return t("proficiency.levelProgress", {
      label,
      experience: weapon.experience.toLocaleString(language),
      required: level.required.toLocaleString(language),
      remaining: (level.remaining ?? 0).toLocaleString(language),
    });
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
        <p className="py-12 text-center text-base text-ui-muted">
          {proficiency ? t("proficiency.empty") : t("proficiency.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          <aside
            className="flex shrink-0 flex-col gap-2"
            style={{ width: 202 * scale }}
          >
            <div className="flex flex-col gap-1 rounded-sm border border-ui-stone-light/20 bg-black/25 p-2">
              <h3 className="truncate text-center text-sm text-ui-muted">
                {weapon ? weaponName(weapon) : "—"}
              </h3>
              <div
                className="relative mx-auto"
                style={{ width: 190 * scale, height: 84 * scale }}
              >
                <PixelImage
                  src={`ui/proficiency/icon-masterylevel-${masteryLevel}.png`}
                  sheetWidth={190}
                  sheetHeight={84}
                  scale={scale}
                  className="absolute inset-0"
                />
                {masteryLevel > 0 && (
                  <PixelImage
                    src={`ui/proficiency/icon-masterylevel-${masteryLevel}-${
                      weapon?.mastered ? "gold" : "silver"
                    }.png`}
                    sheetWidth={190}
                    sheetHeight={84}
                    scale={scale}
                    className="absolute inset-0"
                  />
                )}
                <span
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: 2 * scale }}
                >
                  {weaponSpriteId === null ? (
                    <span aria-hidden className="text-2xl text-ui-muted">
                      ?
                    </span>
                  ) : (
                    <SpriteIcon spriteId={weaponSpriteId} scale={1.5} />
                  )}
                </span>
              </div>
              {weapon && (
                <>
                  <p className="text-center text-sm font-bold tabular-nums text-ui-text-bright">
                    {experienceLabel}
                  </p>
                  <p className="text-center text-sm tabular-nums text-ui-muted">
                    {weapon.mastered
                      ? t("proficiency.mastered")
                      : t("proficiency.xpForNextLevel", {
                          experience: Math.max(
                            0,
                            (weapon.nextLevelExperience ?? weapon.experience) -
                              weapon.experience,
                          ).toLocaleString(language),
                        })}
                  </p>
                </>
              )}
            </div>
            <Input
              aria-label={t("proficiency.searchLabel")}
              placeholder={t("proficiency.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {visibleWeapons.length === 0 ? (
              <p className="py-4 text-center text-sm text-ui-muted">
                {t("proficiency.searchEmpty")}
              </p>
            ) : (
              <ul className="ui-scrollbar flex max-h-72 flex-wrap content-start gap-1 overflow-y-auto rounded-sm border border-ui-stone-light/20 bg-black/25 p-1.5 xl:max-h-none">
                {visibleWeapons.map((entry) => (
                  <li key={entry.proficiencyId}>
                    <ProficiencyWeaponTile
                      weapon={entry}
                      name={weaponName(entry)}
                      spriteId={sprites.get(entry.proficiencyId) ?? null}
                      selected={entry.proficiencyId === weapon?.proficiencyId}
                      onSelect={() => setSelectedId(entry.proficiencyId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="ui-scrollbar min-w-0 flex-1 overflow-x-auto">
            {catalog.pending && (
              <p className="py-12 text-center text-base text-ui-muted">
                {t("proficiency.catalogLoading")}
              </p>
            )}
            {catalog.error && (
              <p role="alert" className="py-12 text-center text-base text-red-300">
                {t("proficiency.catalogError")}
              </p>
            )}
            {!catalog.pending && !catalog.error && weapon && !profile && (
              <p className="py-12 text-center text-base text-ui-muted">
                {t("proficiency.noProfile")}
              </p>
            )}
            {weapon && profile && percents && (
              <div className="flex w-max flex-col gap-[3px]">
                <div className="flex">
                  {columnIndexes.map((levelIndex) => {
                    const level = percents.perLevel[levelIndex];
                    const remaining = level?.remaining ?? null;
                    return (
                      <ProficiencyLevelStar
                        key={levelIndex}
                        percent={level?.percent ?? 0}
                        mastered={weapon.mastered}
                        label={
                          remaining
                            ? formatProficiencyExperience(remaining, language)
                            : null
                        }
                        title={levelTitle(levelIndex)}
                      />
                    );
                  })}
                </div>
                <div
                  title={t("proficiency.overallProgress", {
                    percent: Math.round(percents.overall),
                  })}
                  className="relative overflow-hidden border border-ui-stone-light/25 bg-black/45"
                  style={{ height: 14 * scale }}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-ui-gold-deep/70"
                    style={{ width: `${percents.overall}%` }}
                  />
                </div>
                <div className="flex">
                  {columnIndexes.map((levelIndex) => (
                    <ProficiencyPerkColumn
                      key={levelIndex}
                      levelIndex={levelIndex}
                      perks={profile.levels[levelIndex]?.perks ?? []}
                      unlocked={levelIndex < weapon.unlockedLevels}
                      percent={percents.perLevel[levelIndex]?.percent ?? 0}
                      selectedIndex={draft.get(levelIndex) ?? null}
                      disabled={pending}
                      onPick={(index) => setPick(levelIndex, index)}
                    />
                  ))}
                </div>
                <div className="flex">
                  {columnIndexes.map((levelIndex) => {
                    const pickedIndex = draft.get(levelIndex);
                    const picked =
                      pickedIndex !== undefined
                        ? profile.levels[levelIndex]?.perks[pickedIndex]
                        : undefined;
                    const locked = levelIndex >= weapon.unlockedLevels;
                    const remaining = percents.perLevel[levelIndex]?.remaining;
                    return (
                      <ProficiencyPerkDetailCell
                        key={levelIndex}
                        label={
                          !locked && picked
                            ? formatProficiencyPerk(picked, t)
                            : null
                        }
                        locked={locked}
                        lockedHint={
                          remaining
                            ? t("proficiency.xpRemaining", {
                                experience: remaining.toLocaleString(language),
                              })
                            : null
                        }
                        title={locked ? levelTitle(levelIndex) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
