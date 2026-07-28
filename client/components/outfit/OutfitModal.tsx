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
import { Modal } from "../ui/Modal";
import { OutfitColorGrid } from "./OutfitColorGrid";
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

type ColorChannel = (typeof COLOR_CHANNELS)[number];

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
 * The outfit window: entitled outfits and mounts, the four colour channels,
 * and the addon toggles. Everything here is a *request* — the server
 * re-validates the whole selection against its own entitlement rows.
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

  const chooseOutfit = (outfit: OutfitEntitlement) => {
    setDraft((current) => ({
      ...current,
      lookType: outfit.lookType,
      addons: clampAddonsToGranted(current.addons, outfit.addons),
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
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section aria-label={t("outfit.outfits")}>
            <h3 className="mb-2 text-ui-text-bright">{t("outfit.outfits")}</h3>
            <ul className="ui-scrollbar flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
              {outfits.map((outfit) => (
                <li key={outfit.lookType}>
                  <button
                    type="button"
                    aria-pressed={outfit.lookType === preview.lookType}
                    onClick={() => chooseOutfit(outfit)}
                    className={`w-full rounded-md border px-3 py-1.5 text-left ${
                      outfit.lookType === preview.lookType
                        ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                        : "border-ui-stone-light/25 hover:border-ui-gold/50"
                    }`}
                  >
                    {outfit.name}
                  </button>
                </li>
              ))}
            </ul>
            {outfits.length <= 2 && (
              <p className="mt-2 text-xs text-ui-muted">
                {t("outfit.starterOnly")}
              </p>
            )}
          </section>
          <section aria-label={t("outfit.mounts")}>
            <h3 className="mb-2 text-ui-text-bright">{t("outfit.mounts")}</h3>
            {mounts.length === 0 ? (
              <p className="text-xs text-ui-muted">{t("outfit.noMounts")}</p>
            ) : (
              <ul className="ui-scrollbar flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
                <li>
                  <button
                    type="button"
                    aria-pressed={!selectedMount}
                    onClick={() =>
                      setDraft((current) => ({ ...current, mountId: 0 }))
                    }
                    className={`w-full rounded-md border px-3 py-1.5 text-left ${
                      !selectedMount
                        ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                        : "border-ui-stone-light/25 hover:border-ui-gold/50"
                    }`}
                  >
                    {t("outfit.noMount")}
                  </button>
                </li>
                {mounts.map((mount) => (
                  <li key={mount.mountId}>
                    <button
                      type="button"
                      aria-pressed={mount.mountId === selectedMount?.mountId}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          mountId: mount.mountId,
                        }))
                      }
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left ${
                        mount.mountId === selectedMount?.mountId
                          ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                          : "border-ui-stone-light/25 hover:border-ui-gold/50"
                      }`}
                    >
                      <span>{mount.name}</span>
                      <span className="text-xs text-ui-muted">
                        {t("outfit.mountSpeed", { speed: mount.speed })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
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
          <div className="flex gap-4">
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
      </div>
    </Modal>
  );
}
