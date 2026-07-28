"use client";

import { useMemo, useState } from "react";
import type { MountEntitlement, OutfitEntitlement } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  clampAddonsToGranted,
  selectableAddons,
} from "../../lib/outfit/selectableAddons";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { OutfitColorGrid } from "./OutfitColorGrid";
import { OutfitPickerGrid, type OutfitPickerEntry } from "./OutfitPickerGrid";
import { OutfitPreview } from "./OutfitPreview";

export interface OutfitSelection {
  readonly lookType: number;
  readonly head: number;
  readonly body: number;
  readonly legs: number;
  readonly feet: number;
  readonly addons: number;
  readonly mountId: number;
}

const COLOR_CHANNELS = ["head", "body", "legs", "feet"] as const;
const PICKER_TABS = ["outfits", "mounts"] as const;

type ColorChannel = (typeof COLOR_CHANNELS)[number];
type PickerTab = (typeof PICKER_TABS)[number];

interface OutfitModalProps {
  outfits: ReadonlyArray<OutfitEntitlement>;
  mounts: ReadonlyArray<MountEntitlement>;
  initial: OutfitSelection;
  pending: boolean;
  error: string | null;
  onConfirm: (selection: OutfitSelection) => void;
  onClose: () => void;
}

/**
 * The outfit window: entitled outfits and mounts as sprite grids, the four
 * colour channels, and the addon toggles. Everything here is a *request* —
 * the server re-validates the whole selection against its own entitlement
 * rows.
 */
export function OutfitModal({
  outfits,
  mounts,
  initial,
  pending,
  error,
  onConfirm,
  onClose,
}: OutfitModalProps) {
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState<OutfitSelection>(initial);
  const [channel, setChannel] = useState<ColorChannel>("head");
  const [tab, setTab] = useState<PickerTab>("outfits");
  const [search, setSearch] = useState("");
  /** Remembers the mount to re-mount on, so the toggle is not destructive. */
  const [preferredMountId, setPreferredMountId] = useState(
    initial.mountId || mounts[0]?.mountId || 0,
  );

  const selectedOutfit =
    outfits.find((outfit) => outfit.lookType === draft.lookType) ?? outfits[0];
  const grantedAddons = selectedOutfit?.addons ?? 0;
  const addons = selectableAddons(grantedAddons);
  const selectedMount = mounts.find((mount) => mount.mountId === draft.mountId);
  const preview = useMemo(
    () => ({
      lookType: selectedOutfit?.lookType ?? draft.lookType,
      head: draft.head,
      body: draft.body,
      legs: draft.legs,
      feet: draft.feet,
      addons: clampAddonsToGranted(draft.addons, grantedAddons),
      mountLookType: selectedMount?.lookType ?? 0,
    }),
    [draft, grantedAddons, selectedOutfit?.lookType, selectedMount?.lookType],
  );

  // Thumbnails keep the colours the window opened with: re-baking every tile
  // on each palette click would cost one canvas pass per entitled outfit.
  const thumbnailColors = useMemo(
    () => ({
      head: initial.head,
      body: initial.body,
      legs: initial.legs,
      feet: initial.feet,
      addons: 0,
    }),
    [initial.head, initial.body, initial.legs, initial.feet],
  );

  const matchesSearch = (name: string) =>
    name.toLowerCase().includes(search.trim().toLowerCase());

  const entries: ReadonlyArray<OutfitPickerEntry> =
    tab === "outfits"
      ? outfits
          .filter((outfit) => matchesSearch(outfit.name))
          .map((outfit) => ({
            key: String(outfit.lookType),
            outfit: { ...thumbnailColors, lookType: outfit.lookType },
            label: outfit.name,
            selected: outfit.lookType === preview.lookType,
          }))
      : mounts
          .filter((mount) => matchesSearch(mount.name))
          .map((mount) => ({
            key: String(mount.mountId),
            outfit: { ...thumbnailColors, lookType: mount.lookType },
            label: mount.name,
            title: t("outfit.mountSpeed", { speed: mount.speed }),
            selected: mount.mountId === selectedMount?.mountId,
          }));

  const chooseEntry = (key: string) => {
    if (tab === "outfits") {
      const outfit = outfits.find((entry) => String(entry.lookType) === key);
      if (!outfit) return;
      setDraft((current) => ({
        ...current,
        lookType: outfit.lookType,
        addons: clampAddonsToGranted(current.addons, outfit.addons),
      }));
      return;
    }
    const mount = mounts.find((entry) => String(entry.mountId) === key);
    if (!mount) return;
    setPreferredMountId(mount.mountId);
    setDraft((current) => ({ ...current, mountId: mount.mountId }));
  };

  const toggleMount = () => {
    setDraft((current) => ({
      ...current,
      mountId: current.mountId ? 0 : preferredMountId,
    }));
  };

  const toggleAddon = (bit: 1 | 2) => {
    setDraft((current) => ({
      ...current,
      addons: clampAddonsToGranted(current.addons ^ bit, grantedAddons),
    }));
  };

  return (
    <Modal
      title={t("outfit.title")}
      onClose={onClose}
      size="wide"
      footer={
        <Button
          variant="primary"
          disabled={pending || !selectedOutfit}
          onClick={() =>
            selectedOutfit &&
            onConfirm({
              ...draft,
              lookType: selectedOutfit.lookType,
              addons: clampAddonsToGranted(draft.addons, grantedAddons),
              mountId: selectedMount?.mountId ?? 0,
            })
          }
        >
          {t("outfit.confirm")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
          {/* Fixed stage: the baked preview grows with mounts and addons, and
              the window must not resize under the pointer when it does. */}
          <div className="flex h-56 w-full items-center justify-center rounded-md border border-ui-stone-light/25 bg-black/30 p-4">
            {selectedOutfit ? (
              <OutfitPreview selection={preview} className="size-full" />
            ) : (
              <p className="text-xs text-ui-muted">{t("outfit.noOutfits")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              label={t("outfit.firstAddon")}
              checked={(preview.addons & 1) === 1}
              disabled={!addons.first}
              onChange={() => toggleAddon(1)}
            />
            <Checkbox
              label={t("outfit.secondAddon")}
              checked={(preview.addons & 2) === 2}
              disabled={!addons.second}
              onChange={() => toggleAddon(2)}
            />
            <Checkbox
              label={t("outfit.mountToggle")}
              checked={Boolean(selectedMount)}
              disabled={mounts.length === 0}
              onChange={toggleMount}
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
            label={t(`outfit.channels.${channel}`)}
            selected={draft[channel]}
            onSelect={(index) =>
              setDraft((current) => ({ ...current, [channel]: index }))
            }
          />
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div role="tablist" aria-label={t("outfit.title")} className="flex gap-2">
            {PICKER_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={tab === entry}
                onClick={() => setTab(entry)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  tab === entry
                    ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                    : "border-ui-stone-light/25 hover:border-ui-gold/50"
                }`}
              >
                {t(`outfit.${entry}`)}
              </button>
            ))}
          </div>
          <Input
            label={t("outfit.search")}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("outfit.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <OutfitPickerGrid
            label={t(`outfit.${tab}`)}
            entries={entries}
            emptyLabel={
              tab === "outfits" ? t("outfit.noOutfits") : t("outfit.noMounts")
            }
            onSelect={chooseEntry}
          />
        </div>
      </div>
    </Modal>
  );
}
