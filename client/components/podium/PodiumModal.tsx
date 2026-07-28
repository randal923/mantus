"use client";

import { useMemo, useState } from "react";
import type { PodiumCurrent, PodiumWindowMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  clampAddonsToGranted,
  selectableAddons,
} from "../../lib/outfit/selectableAddons";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Modal } from "../ui/Modal";
import { OutfitColorGrid } from "../outfit/OutfitColorGrid";
import { OutfitPickerGrid } from "../outfit/OutfitPickerGrid";
import { OutfitPreview } from "../outfit/OutfitPreview";

const COLOR_CHANNELS = ["head", "body", "legs", "feet"] as const;
type ColorChannel = (typeof COLOR_CHANNELS)[number];

const DIRECTIONS = [0, 1, 2, 3] as const;
const DIRECTION_ARROWS = ["↑", "→", "↓", "←"] as const;

interface PodiumModalProps {
  window: PodiumWindowMessage;
  error: string | null;
  onApply: (selection: PodiumCurrent) => void;
  onClose: () => void;
}

/**
 * The podium edit window (Feature 86). Renown podiums pick from the owned
 * outfit/mount entitlements; vigour/tenacity pick an unlocked race. Every
 * choice is a request — the server re-validates ownership and copies monster
 * looks from its own catalog.
 */
export function PodiumModal({
  window: podium,
  error,
  onApply,
  onClose,
}: PodiumModalProps) {
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState<PodiumCurrent>(podium.current);
  const [channel, setChannel] = useState<ColorChannel>("head");
  /** Remembers the mount to re-mount on, so the toggle is not destructive. */
  const [preferredMountLookType, setPreferredMountLookType] = useState(
    podium.current.mountLookType || podium.mounts[0]?.lookType || 0,
  );

  // Thumbnails keep the colours the window opened with: re-baking every tile
  // on each palette click would cost one canvas pass per entitled outfit.
  const opened = podium.current;
  const thumbnailColors = useMemo(
    () => ({
      head: opened.head,
      body: opened.body,
      legs: opened.legs,
      feet: opened.feet,
      addons: 0,
    }),
    [opened.head, opened.body, opened.legs, opened.feet],
  );

  const isRenown = podium.family === "renown";
  const selectedOutfit = podium.outfits.find(
    (outfit) => outfit.lookType === draft.lookType,
  );
  const grantedAddons = selectedOutfit?.addons ?? 0;
  const addons = selectableAddons(grantedAddons);
  const selectedRace = podium.races.find(
    (race) => race.raceId === draft.raceId,
  );
  const preview = useMemo(() => {
    if (isRenown) {
      return {
        lookType: draft.lookType,
        head: draft.head,
        body: draft.body,
        legs: draft.legs,
        feet: draft.feet,
        addons: clampAddonsToGranted(draft.addons, grantedAddons),
        mountLookType: draft.mountLookType,
      };
    }
    const outfit = selectedRace?.outfit;
    return {
      lookType: outfit?.lookType ?? 0,
      head: outfit?.head ?? 0,
      body: outfit?.body ?? 0,
      legs: outfit?.legs ?? 0,
      feet: outfit?.feet ?? 0,
      addons: outfit?.addons ?? 0,
      mountLookType: 0,
    };
  }, [draft, grantedAddons, isRenown, selectedRace]);

  const toggleAddon = (bit: number) => {
    setDraft((current) => ({
      ...current,
      addons:
        (current.addons & bit) === bit
          ? current.addons & ~bit
          : current.addons | bit,
    }));
  };

  const apply = () => {
    onApply({
      ...draft,
      addons: isRenown ? clampAddonsToGranted(draft.addons, grantedAddons) : 0,
      lookType: isRenown ? draft.lookType : 0,
      head: isRenown ? draft.head : 0,
      body: isRenown ? draft.body : 0,
      legs: isRenown ? draft.legs : 0,
      feet: isRenown ? draft.feet : 0,
      mountLookType: isRenown ? draft.mountLookType : 0,
      raceId: isRenown ? 0 : draft.raceId,
    });
  };

  const listButtonClass = (selected: boolean) =>
    `w-full rounded-md border px-3 py-1.5 text-left text-sm ${
      selected
        ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
        : "border-ui-stone-light/25 hover:border-ui-gold/50"
    }`;

  return (
    <Modal title={t(`podium.title.${podium.family}`)} onClose={onClose} size="wide">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex w-full flex-col items-center gap-3 sm:w-44">
          <div className="flex h-56 w-full items-center justify-center rounded-md border border-ui-stone-light/25 bg-black/30 p-4">
            {preview.lookType > 0 || preview.mountLookType > 0 ? (
              <OutfitPreview selection={preview} className="size-full" />
            ) : (
              <p className="text-xs text-ui-muted">{t("podium.empty")}</p>
            )}
          </div>
          <div
            role="group"
            aria-label={t("podium.direction")}
            className="flex gap-2"
          >
            {DIRECTIONS.map((direction) => (
              <button
                key={direction}
                type="button"
                aria-pressed={draft.direction === direction}
                onClick={() =>
                  setDraft((current) => ({ ...current, direction }))
                }
                className={`rounded-md border px-3 py-1 text-sm ${
                  draft.direction === direction
                    ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                    : "border-ui-stone-light/25 hover:border-ui-gold/50"
                }`}
              >
                {DIRECTION_ARROWS[direction]}
              </button>
            ))}
          </div>
          <Checkbox
            label={t("podium.showPlatform")}
            checked={draft.podiumVisible}
            onChange={() =>
              setDraft((current) => ({
                ...current,
                podiumVisible: !current.podiumVisible,
              }))
            }
          />
          {!isRenown && (
            <Checkbox
              label={t("podium.showMonster")}
              checked={draft.monsterVisible}
              onChange={() =>
                setDraft((current) => ({
                  ...current,
                  monsterVisible: !current.monsterVisible,
                }))
              }
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {isRenown ? (
            <>
              <OutfitPickerGrid
                label={t("outfit.outfits")}
                emptyLabel={t("outfit.noOutfits")}
                entries={podium.outfits.map((outfit) => ({
                  key: String(outfit.lookType),
                  outfit: { ...thumbnailColors, lookType: outfit.lookType },
                  label: outfit.name,
                  selected: outfit.lookType === draft.lookType,
                }))}
                onSelect={(key) => {
                  const outfit = podium.outfits.find(
                    (entry) => String(entry.lookType) === key,
                  );
                  if (!outfit) return;
                  setDraft((current) => ({
                    ...current,
                    lookType: outfit.lookType,
                    addons: clampAddonsToGranted(current.addons, outfit.addons),
                  }));
                }}
              />
              <div className="flex flex-wrap gap-4">
                <Checkbox
                  label={t("outfit.firstAddon")}
                  checked={(draft.addons & 1) === 1}
                  disabled={!addons.first}
                  onChange={() => toggleAddon(1)}
                />
                <Checkbox
                  label={t("outfit.secondAddon")}
                  checked={(draft.addons & 2) === 2}
                  disabled={!addons.second}
                  onChange={() => toggleAddon(2)}
                />
                <Checkbox
                  label={t("outfit.mountToggle")}
                  checked={draft.mountLookType > 0}
                  disabled={podium.mounts.length === 0}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      mountLookType: current.mountLookType
                        ? 0
                        : preferredMountLookType,
                    }))
                  }
                />
              </div>
              <div
                role="tablist"
                aria-label={t("outfit.colors")}
                className="flex gap-2"
              >
                {COLOR_CHANNELS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="tab"
                    aria-selected={channel === entry}
                    onClick={() => setChannel(entry)}
                    className={`rounded-md border px-3 py-1 text-xs uppercase tracking-wide ${
                      channel === entry
                        ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                        : "border-ui-stone-light/25 hover:border-ui-gold/50"
                    }`}
                  >
                    {t(`outfit.channels.${entry}`)}
                  </button>
                ))}
              </div>
              <OutfitColorGrid
                label={t("outfit.colors")}
                selected={draft[channel]}
                onSelect={(index) =>
                  setDraft((current) => ({ ...current, [channel]: index }))
                }
              />
              <OutfitPickerGrid
                label={t("outfit.mounts")}
                emptyLabel={t("outfit.noMounts")}
                entries={podium.mounts.map((mount) => ({
                  key: String(mount.mountId),
                  outfit: { ...thumbnailColors, lookType: mount.lookType },
                  label: mount.name,
                  selected: mount.lookType === draft.mountLookType,
                }))}
                onSelect={(key) => {
                  const mount = podium.mounts.find(
                    (entry) => String(entry.mountId) === key,
                  );
                  if (!mount) return;
                  setPreferredMountLookType(mount.lookType);
                  setDraft((current) => ({
                    ...current,
                    mountLookType: mount.lookType,
                  }));
                }}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={draft.raceId === 0}
                onClick={() =>
                  setDraft((current) => ({ ...current, raceId: 0 }))
                }
                className={listButtonClass(draft.raceId === 0)}
              >
                {t("podium.noMonster")}
              </button>
              <OutfitPickerGrid
                label={t("podium.title.vigour")}
                emptyLabel={t("podium.noMonster")}
                entries={podium.races.map((race) => ({
                  key: String(race.raceId),
                  outfit: { ...race.outfit, addons: 0 },
                  label: race.name,
                  selected: race.raceId === draft.raceId,
                }))}
                onSelect={(key) =>
                  setDraft((current) => ({ ...current, raceId: Number(key) }))
                }
              />
            </>
          )}
          {error && <p className="text-sm text-ui-accent-light">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("podium.close")}
            </Button>
            <Button variant="primary" size="sm" onClick={apply}>
              {t("podium.apply")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
