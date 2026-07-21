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
import { WikiBestiary } from "./WikiBestiary";
import { WikiBosstiary } from "./WikiBosstiary";
import { WikiItems } from "./WikiItems";
import type { WikiTab } from "./WikiModalFrame";

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
  const [tab, setTab] = useState<WikiTab>(initialTab);
  const [target, setTarget] = useState<WikiItemSource | null>(null);
  const selectTab = (next: WikiTab) => {
    setTab(next);
    if (next === "bestiary" && !creatures && !bestiaryPending) {
      onRequestBestiary();
    }
    if (next === "bosstiary" && !bosses && !bosstiaryPending) {
      onRequestBosstiary();
    }
  };

  if (tab === "items") {
    return (
      <WikiItems
        activeTab={tab}
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
        onSelectTab={selectTab}
        onClose={onClose}
      />
    );
  }

  if (tab === "bestiary") {
    return (
      <WikiBestiary
        key={target?.scope === "bestiary" ? target.raceId : "bestiary"}
        activeTab={tab}
        creatures={creatures}
        monster={monster}
        pending={bestiaryPending}
        error={bestiaryError}
        initialRaceId={
          target?.scope === "bestiary" ? target.raceId : undefined
        }
        onRequestMonster={onRequestMonster}
        onSelectTab={selectTab}
        onClose={onClose}
      />
    );
  }

  return (
    <WikiBosstiary
      key={target?.scope === "bosstiary" ? target.raceId : "bosstiary"}
      activeTab={tab}
      bosses={bosses}
      boss={boss}
      pending={bosstiaryPending}
      error={bosstiaryError}
      initialRaceId={
        target?.scope === "bosstiary" ? target.raceId : undefined
      }
      onRequestBoss={onRequestBoss}
      onSelectTab={selectTab}
      onClose={onClose}
    />
  );
}
