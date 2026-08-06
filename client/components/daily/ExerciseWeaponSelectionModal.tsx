"use client";

import { useState } from "react";
import type { DailyRewardPoolEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface ExerciseWeaponSelectionModalProps {
  weapons: ReadonlyArray<DailyRewardPoolEntry>;
  onConfirm: (itemTypeId: number) => void;
  onClose: () => void;
}

/**
 * Server-projected exercise weapons available for today's reward, shown as the
 * animated item art itself rather than a list of names. The selection is a
 * hint: the server re-checks pool membership when the claim arrives.
 */
export function ExerciseWeaponSelectionModal({
  weapons,
  onConfirm,
  onClose,
}: ExerciseWeaponSelectionModalProps) {
  const { t } = useAppTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <Modal
      title={t("dailyRewards.weaponPickerTitle")}
      onClose={onClose}
      size="wide"
      height="auto"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("dailyRewards.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={selectedId === null}
            onClick={() => {
              if (selectedId !== null) onConfirm(selectedId);
            }}
          >
            {t("dailyRewards.chooseWeapon")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="border border-ui-stone-light/15 bg-black/25 px-4 py-3 text-ui-muted">
          {t("dailyRewards.weaponPickerDescription")}
        </p>
        {weapons.length === 0 ? (
          <p className="py-8 text-center text-ui-muted">
            {t("dailyRewards.noWeapons")}
          </p>
        ) : (
          <section
            aria-label={t("dailyRewards.selectWeapon")}
            className="flex flex-col gap-2"
          >
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("dailyRewards.weaponPickerLabel")}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weapons.map((weapon) => {
                const active = weapon.itemTypeId === selectedId;
                return (
                  <li key={weapon.itemTypeId}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(weapon.itemTypeId)}
                      onDoubleClick={() => onConfirm(weapon.itemTypeId)}
                      className={`flex w-full flex-col items-center gap-2 rounded-sm border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                        active
                          ? "border-ui-gold/70 bg-ui-gold/10"
                          : "border-ui-stone-light/15 bg-ui-panel-deep/55 hover:border-ui-gold/40"
                      }`}
                    >
                      <SpriteIcon
                        spriteId={weapon.spriteId}
                        clientId={weapon.itemTypeId}
                        scale={2}
                      />
                      <span
                        className={`w-full truncate text-center text-sm capitalize ${
                          active ? "text-ui-text-bright" : "text-ui-text"
                        }`}
                      >
                        {weapon.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
