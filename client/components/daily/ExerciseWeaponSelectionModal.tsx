"use client";

import { useState } from "react";
import type { DailyRewardPoolEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Modal } from "../ui/Modal";

interface ExerciseWeaponSelectionModalProps {
  weapons: ReadonlyArray<DailyRewardPoolEntry>;
  onConfirm: (itemTypeId: number) => void;
  onClose: () => void;
}

/** Server-projected exercise weapons available for today's reward. */
export function ExerciseWeaponSelectionModal({
  weapons,
  onConfirm,
  onClose,
}: ExerciseWeaponSelectionModalProps) {
  const { t } = useAppTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedWeapon = weapons.find(
    (weapon) => weapon.itemTypeId === selectedId,
  );

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
          <div className="flex flex-col gap-4">
            <Dropdown
              ariaLabel={t("dailyRewards.weaponPickerLabel")}
              label={t("dailyRewards.weaponPickerLabel")}
              value={selectedId === null ? "" : String(selectedId)}
              options={[
                {
                  value: "",
                  label: t("dailyRewards.selectWeapon"),
                  disabled: true,
                },
                ...weapons.map((weapon) => ({
                  value: String(weapon.itemTypeId),
                  label: weapon.name,
                })),
              ]}
              onChange={(value) => {
                const weapon = weapons.find(
                  (entry) => String(entry.itemTypeId) === value,
                );
                setSelectedId(weapon?.itemTypeId ?? null);
              }}
            />
            {selectedWeapon && (
              <div className="flex items-center gap-4 rounded-sm border border-ui-gold/40 bg-ui-panel-deep/70 p-4 text-ui-text-bright">
                <SpriteIcon
                  spriteId={selectedWeapon.spriteId}
                  clientId={selectedWeapon.itemTypeId}
                  scale={2}
                />
                <span className="font-medium capitalize">
                  {selectedWeapon.name}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
