"use client";

import { useState } from "react";
import type {
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
  BosstiaryBossStateMessage,
  BosstiaryStateMessage,
  WikiItemSource,
  WikiItemSourcesStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { WikiBestiary } from "./WikiBestiary";
import { WikiBosstiary } from "./WikiBosstiary";
import { WikiItems } from "./WikiItems";
import { WikiTabIcon } from "./WikiTabIcon";

type WikiTab = "items" | "bestiary" | "bosstiary";

interface WikiModalProps {
  initialTab?: WikiTab;
  creatures: BestiaryCreaturesStateMessage | null;
  monster: BestiaryMonsterStateMessage | null;
  bosses: BosstiaryStateMessage | null;
  boss: BosstiaryBossStateMessage | null;
  itemSources: WikiItemSourcesStateMessage | null;
  bestiaryPending: boolean;
  bosstiaryPending: boolean;
  itemSourcesPending: boolean;
  bestiaryError: string | null;
  bosstiaryError: string | null;
  onRequestBestiary: () => void;
  onRequestMonster: (raceId: number) => void;
  onRequestBosstiary: () => void;
  onRequestBoss: (raceId: number) => void;
  onRequestItemSources: (itemTypeId: number) => void;
  onClose: () => void;
}

export function WikiModal({
  initialTab = "bestiary",
  creatures,
  monster,
  bosses,
  boss,
  itemSources,
  bestiaryPending,
  bosstiaryPending,
  itemSourcesPending,
  bestiaryError,
  bosstiaryError,
  onRequestBestiary,
  onRequestMonster,
  onRequestBosstiary,
  onRequestBoss,
  onRequestItemSources,
  onClose,
}: WikiModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<WikiTab>(initialTab);
  const [target, setTarget] = useState<WikiItemSource | null>(null);

  return (
    <Modal
      title={t("wiki.title")}
      onClose={onClose}
      size="full"
      tabs={{
        label: t("wiki.sections"),
        selected: tab,
        items: [
          {
            id: "items",
            label: t("wiki.tabs.items"),
            icon: <WikiTabIcon name="items" />,
          },
          {
            id: "bestiary",
            label: t("wiki.tabs.bestiary"),
            icon: <WikiTabIcon name="bestiary" />,
          },
          {
            id: "bosstiary",
            label: t("wiki.tabs.bosstiary"),
            icon: <WikiTabIcon name="bosstiary" />,
          },
        ],
        onSelect: (id) => {
          const next = id as WikiTab;
          setTab(next);
          if (next === "bestiary" && !creatures && !bestiaryPending) {
            onRequestBestiary();
          }
          if (next === "bosstiary" && !bosses && !bosstiaryPending) {
            onRequestBosstiary();
          }
        },
      }}
    >
      <>
        {tab === "items" && (
          <WikiItems
            itemSources={itemSources}
            sourcesPending={itemSourcesPending}
            onRequestItemSources={onRequestItemSources}
            onSelectSource={(source) => {
              setTarget(source);
              if (source.scope === "bestiary") {
                onRequestMonster(source.raceId);
                setTab("bestiary");
                return;
              }
              onRequestBoss(source.raceId);
              setTab("bosstiary");
            }}
          />
        )}
        {tab === "bestiary" && (
          <WikiBestiary
            key={target?.scope === "bestiary" ? target.raceId : "bestiary"}
            creatures={creatures}
            monster={monster}
            pending={bestiaryPending}
            error={bestiaryError}
            initialRaceId={
              target?.scope === "bestiary" ? target.raceId : undefined
            }
            onRequestMonster={onRequestMonster}
          />
        )}
        {tab === "bosstiary" && (
          <WikiBosstiary
            key={target?.scope === "bosstiary" ? target.raceId : "bosstiary"}
            bosses={bosses}
            boss={boss}
            pending={bosstiaryPending}
            error={bosstiaryError}
            initialRaceId={
              target?.scope === "bosstiary" ? target.raceId : undefined
            }
            onRequestBoss={onRequestBoss}
          />
        )}
      </>
    </Modal>
  );
}
