"use client";

import { useState } from "react";
import type {
  AnimusStateMessage,
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
  BoostedStateMessage,
  BossSlotsStateMessage,
  BosstiaryBossStateMessage,
  BosstiaryStateMessage,
  CyclopediaCombatStateMessage,
  CyclopediaDeathsStateMessage,
  CyclopediaItemSummaryStateMessage,
  CyclopediaPvpKillsStateMessage,
  CyclopediaView,
  OwnCharacterState,
  ProfileStateMessage,
  WikiItemSource,
  WikiItemSourcesStateMessage,
} from "@tibia/protocol";
import { WikiBestiary } from "./WikiBestiary";
import { WikiBosstiary } from "./WikiBosstiary";
import { WikiCharacter } from "./WikiCharacter";
import { WikiItems } from "./WikiItems";
import type { WikiTab } from "./WikiModalFrame";

interface WikiModalProps {
  initialTab?: WikiTab;
  creatures: BestiaryCreaturesStateMessage | null;
  monster: BestiaryMonsterStateMessage | null;
  bosses: BosstiaryStateMessage | null;
  boss: BosstiaryBossStateMessage | null;
  itemSources: WikiItemSourcesStateMessage | null;
  boosted: BoostedStateMessage | null;
  /** Animus mastery projection (mastered races + current bonus). */
  animus: AnimusStateMessage | null;
  trackedBestiaryRaceIds: ReadonlyArray<number>;
  trackedBosstiaryRaceIds: ReadonlyArray<number>;
  bossSlots: BossSlotsStateMessage | null;
  /** Own character state for the Cyclopedia character tab. */
  character: OwnCharacterState;
  capacityUsed: number | null;
  combat: CyclopediaCombatStateMessage | null;
  deaths: CyclopediaDeathsStateMessage | null;
  pvpKills: CyclopediaPvpKillsStateMessage | null;
  itemSummary: CyclopediaItemSummaryStateMessage | null;
  profile: ProfileStateMessage | null;
  bestiaryPending: boolean;
  bosstiaryPending: boolean;
  itemSourcesPending: boolean;
  bossSlotsPending: boolean;
  cyclopediaPending: boolean;
  bestiaryError: string | null;
  bosstiaryError: string | null;
  bossSlotsError: string | null;
  cyclopediaError: string | null;
  onRequestBestiary: () => void;
  onRequestMonster: (raceId: number) => void;
  onRequestBosstiary: () => void;
  onRequestBoss: (raceId: number) => void;
  onRequestItemSources: (itemTypeId: number) => void;
  onRequestBossSlots: () => void;
  onRequestCyclopedia: (view: CyclopediaView, page?: number) => void;
  onToggleTrack: (
    scope: "bestiary" | "bosstiary",
    raceId: number,
    enabled: boolean,
  ) => void;
  onAssignBossSlot: (slot: number, raceId: number) => void;
  onClearBossSlot: (slot: number) => void;
  onClose: () => void;
}

export function WikiModal({
  initialTab = "bestiary",
  creatures,
  monster,
  bosses,
  boss,
  itemSources,
  boosted,
  animus,
  trackedBestiaryRaceIds,
  trackedBosstiaryRaceIds,
  bossSlots,
  character,
  capacityUsed,
  combat,
  deaths,
  pvpKills,
  itemSummary,
  profile,
  bestiaryPending,
  bosstiaryPending,
  itemSourcesPending,
  bossSlotsPending,
  cyclopediaPending,
  bestiaryError,
  bosstiaryError,
  bossSlotsError,
  cyclopediaError,
  onRequestBestiary,
  onRequestMonster,
  onRequestBosstiary,
  onRequestBoss,
  onRequestItemSources,
  onRequestBossSlots,
  onRequestCyclopedia,
  onToggleTrack,
  onAssignBossSlot,
  onClearBossSlot,
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
    if (next === "bosstiary" && !bossSlots && !bossSlotsPending) {
      onRequestBossSlots();
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
            selectTab("bestiary");
            return;
          }
          onRequestBoss(source.raceId);
          selectTab("bosstiary");
        }}
        onSelectTab={selectTab}
        onClose={onClose}
      />
    );
  }

  if (tab === "character") {
    return (
      <WikiCharacter
        activeTab={tab}
        character={character}
        capacityUsed={capacityUsed}
        combat={combat}
        deaths={deaths}
        pvpKills={pvpKills}
        itemSummary={itemSummary}
        cyclopediaPending={cyclopediaPending}
        cyclopediaError={cyclopediaError}
        profile={profile}
        onRequestCyclopedia={onRequestCyclopedia}
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
        boosted={boosted}
        animus={animus}
        trackedRaceIds={trackedBestiaryRaceIds}
        pending={bestiaryPending}
        error={bestiaryError}
        initialRaceId={
          target?.scope === "bestiary" ? target.raceId : undefined
        }
        onRequestMonster={onRequestMonster}
        onToggleTrack={(raceId, enabled) =>
          onToggleTrack("bestiary", raceId, enabled)
        }
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
      boosted={boosted}
      trackedRaceIds={trackedBosstiaryRaceIds}
      bossSlots={bossSlots}
      pending={bosstiaryPending}
      bossSlotsPending={bossSlotsPending}
      error={bosstiaryError}
      bossSlotsError={bossSlotsError}
      initialRaceId={
        target?.scope === "bosstiary" ? target.raceId : undefined
      }
      onRequestBoss={onRequestBoss}
      onToggleTrack={(raceId, enabled) =>
        onToggleTrack("bosstiary", raceId, enabled)
      }
      onAssignBossSlot={onAssignBossSlot}
      onClearBossSlot={onClearBossSlot}
      onSelectTab={selectTab}
      onClose={onClose}
    />
  );
}
