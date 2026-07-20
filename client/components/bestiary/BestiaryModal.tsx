"use client";

import { useState } from "react";
import type {
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { BestiaryCreatureList } from "./BestiaryCreatureList";
import { BestiaryMonsterSheet } from "./BestiaryMonsterSheet";

type BestiaryView = { kind: "list" } | { kind: "monster"; raceId: number };

interface BestiaryModalProps {
  creatures: BestiaryCreaturesStateMessage | null;
  monster: BestiaryMonsterStateMessage | null;
  pending: boolean;
  error: string | null;
  onRequestMonster: (raceId: number) => void;
  onClose: () => void;
}

/**
 * One scrollable bestiary (class headers + creatures + search) rendered
 * from the preloaded projection; only the detail sheet is fetched on click.
 */
export function BestiaryModal({
  creatures,
  monster,
  pending,
  error,
  onRequestMonster,
  onClose,
}: BestiaryModalProps) {
  const { t } = useAppTranslation();
  const [view, setView] = useState<BestiaryView>({ kind: "list" });
  const monsterReady = view.kind === "monster" && monster?.raceId === view.raceId;

  return (
    <Modal title={t("bestiary.title")} onClose={onClose} size="wide">
      <div className="flex items-center gap-3">
        {view.kind === "monster" && (
          <Button size="sm" onClick={() => setView({ kind: "list" })}>
            {t("bestiary.back")}
          </Button>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-ui-muted">
          {view.kind === "list"
            ? t("bestiary.subtitle")
            : (monsterReady ? monster.name : "")}
        </span>
        {creatures && (
          <span className="text-xs text-ui-gold">
            {t("bestiary.charmPoints", {
              points: creatures.charmPoints.toLocaleString(),
            })}
          </span>
        )}
      </div>
      <div>
        {view.kind === "list" &&
          (creatures ? (
            <BestiaryCreatureList
              entries={creatures.entries}
              onSelect={(raceId) => {
                setView({ kind: "monster", raceId });
                if (monster?.raceId !== raceId) onRequestMonster(raceId);
              }}
            />
          ) : (
            <p className="py-6 text-center text-xs text-ui-muted">
              {t("bestiary.loading")}
            </p>
          ))}
        {view.kind === "monster" &&
          (monsterReady ? (
            <BestiaryMonsterSheet monster={monster} />
          ) : (
            <p className="py-6 text-center text-xs text-ui-muted">
              {t("bestiary.loading")}
            </p>
          ))}
      </div>
      {error && !pending && (
        <p role="alert" className="text-xs text-red-300">
          {t(`bestiary.errors.${error}`, { defaultValue: error })}
        </p>
      )}
    </Modal>
  );
}
