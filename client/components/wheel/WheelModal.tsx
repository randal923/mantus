"use client";

import {
  computeResonanceUnlocks,
  computeWheelBonuses,
  WHEEL_BASE_VOCATION,
  WHEEL_LIMITS,
  WHEEL_SLICES,
  type CharacterVocation,
  type GemAction,
  type GemActionFailedReason,
  type GemStateMessage,
  type WheelActionFailedReason,
  type WheelStateMessage,
} from "@tibia/protocol";
import Image from "next/image";
import { useMemo, useState } from "react";
import { trySetWheelSlice } from "../../lib/wheel/trySetWheelSlice";
import { wheelBaseVocationKey } from "../../lib/wheel/wheelBaseVocationKey";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { FragmentWorkshopTab } from "./FragmentWorkshopTab";
import { GemAtelierTab } from "./GemAtelierTab";
import { WheelCanvas } from "./WheelCanvas";
import { WheelPerkSummary } from "./WheelPerkSummary";
import { WheelSelectionPanel } from "./WheelSelectionPanel";

type WheelTab = "wheel" | "atelier" | "workshop";

interface WheelModalProps {
  wheel: WheelStateMessage | null;
  gems: GemStateMessage | null;
  vocation: CharacterVocation;
  pending: boolean;
  gemsPending: boolean;
  error: WheelActionFailedReason | null;
  gemsError: GemActionFailedReason | null;
  onSave: (slices: ReadonlyArray<number>) => void;
  onRequestGems: () => void;
  onGemAction: (action: GemAction) => void;
  onClose: () => void;
}

interface WheelDraft {
  source: ReadonlyArray<number> | undefined;
  slices: number[];
}

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

function tabIcon(source: string): React.ReactNode {
  return (
    <Image
      src={source}
      alt=""
      aria-hidden
      width={24}
      height={24}
      className="h-6 w-6 object-contain [image-rendering:pixelated]"
    />
  );
}

/**
 * Wheel of Destiny window with three tabs: the wheel itself, the Gem
 * Atelier, and the Fragment Workshop. Wheel edits are a local draft the
 * server re-validates on save; gem actions apply immediately server-side.
 */
export function WheelModal({
  wheel,
  gems,
  vocation,
  pending,
  gemsPending,
  error,
  gemsError,
  onSave,
  onRequestGems,
  onGemAction,
  onClose,
}: WheelModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<WheelTab>("wheel");
  const [draftState, setDraftState] = useState<WheelDraft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const serverSlices = wheel?.slices;
  const draft = useMemo(
    () =>
      draftState !== null && draftState.source === serverSlices
        ? draftState.slices
        : serverSlices
          ? [...serverSlices]
          : emptySlices(),
    [draftState, serverSlices],
  );
  const setDraft = (slices: number[]) => {
    setDraftState({ source: serverSlices, slices });
  };

  const totalPoints = wheel?.totalPoints ?? 0;
  const unlocked = wheel?.unlocked ?? false;
  const editable = unlocked && !pending;
  const baseVocation = WHEEL_BASE_VOCATION[vocation];
  const vocationKey = wheelBaseVocationKey(vocation);

  const allocated = draft.reduce((sum, points) => sum + points, 0);
  const available = Math.max(0, totalPoints - allocated);

  const gemInputs = useMemo(() => {
    if (!gems) return undefined;
    const equipped = Object.values(gems.equipped)
      .map((gemId) => gems.revealed.find((gem) => gem.id === gemId))
      .filter((gem) => gem !== undefined);
    return { equipped, grades: gems.grades };
  }, [gems]);

  const bonuses = useMemo(
    () => computeWheelBonuses(draft, vocation, gemInputs),
    [draft, vocation, gemInputs],
  );

  const resonances = useMemo(() => computeResonanceUnlocks(draft), [draft]);

  const domainPoints = useMemo(() => {
    const totals = { green: 0, red: 0, blue: 0, purple: 0 };
    for (const slice of WHEEL_SLICES) {
      totals[slice.domain] += draft[slice.id - 1] ?? 0;
    }
    return totals;
  }, [draft]);

  const unlockableIds = useMemo(() => {
    const ids = new Set<number>();
    if (!editable || available === 0) return ids;
    for (const slice of WHEEL_SLICES) {
      if ((draft[slice.id - 1] ?? 0) > 0) continue;
      if (trySetWheelSlice(draft, slice.id, 1, totalPoints)) ids.add(slice.id);
    }
    return ids;
  }, [draft, editable, available, totalPoints]);

  const applyChange = (sliceId: number, points: number) => {
    const next = trySetWheelSlice(draft, sliceId, points, totalPoints);
    if (next) setDraft(next);
  };

  const infoId = hoveredId ?? selectedId;
  const infoSlice =
    infoId !== null ? (WHEEL_SLICES[infoId - 1] ?? null) : null;
  const infoPoints = infoId !== null ? (draft[infoId - 1] ?? 0) : 0;
  const selectedSlice =
    selectedId !== null ? (WHEEL_SLICES[selectedId - 1] ?? null) : null;
  const selectedPoints =
    selectedId !== null ? (draft[selectedId - 1] ?? 0) : 0;
  const canAdd =
    editable &&
    selectedSlice !== null &&
    available > 0 &&
    trySetWheelSlice(draft, selectedSlice.id, selectedPoints + 1, totalPoints) !==
      null;
  const canRemove =
    editable &&
    selectedSlice !== null &&
    selectedPoints > 0 &&
    trySetWheelSlice(draft, selectedSlice.id, selectedPoints - 1, totalPoints) !==
      null;

  const dirty =
    serverSlices !== undefined &&
    draft.some((points, index) => points !== (serverSlices[index] ?? 0));

  const quickToggle = (sliceId: number) => {
    if (!editable) return;
    const slice = WHEEL_SLICES[sliceId - 1];
    if (!slice) return;
    const points = draft[sliceId - 1] ?? 0;
    if (points === slice.maxPoints) {
      applyChange(sliceId, 0);
      return;
    }
    const target = Math.min(slice.maxPoints, points + available);
    if (target > points) applyChange(sliceId, target);
  };

  return (
    <Modal
      title={t("wheel.title")}
      onClose={onClose}
      size="full"
      tabs={{
        label: t("wheel.sections"),
        selected: tab,
        items: [
          {
            id: "wheel",
            label: t("wheel.tabs.wheel"),
            icon: tabIcon("/assets/wheel/icon-skillwheel-selection.png"),
          },
          {
            id: "atelier",
            label: t("wheel.tabs.atelier"),
            icon: tabIcon("/assets/wheel/icon-gematelier.png"),
          },
          {
            id: "workshop",
            label: t("wheel.tabs.workshop"),
            icon: tabIcon("/assets/wheel/icon-modgrade4.png"),
          },
        ],
        onSelect: (id) => {
          const next = id as WheelTab;
          setTab(next);
          if (next !== "wheel" && !gems && !gemsPending) onRequestGems();
        },
      }}
      footer={
        tab === "wheel" ? (
          <>
            <span className="mr-auto self-center text-sm text-ui-muted">
              {error && (
                <span className="text-ui-accent-light">
                  {t(`wheel.errors.${error}`)}
                </span>
              )}
            </span>
            <Button
              size="sm"
              disabled={!editable || allocated === 0}
              onClick={() => setDraft(emptySlices())}
            >
              {t("wheel.reset")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!editable || !dirty}
              onClick={() => onSave(draft)}
            >
              {t("wheel.save")}
            </Button>
          </>
        ) : undefined
      }
    >
      {tab === "wheel" && (
        <div className="flex flex-wrap items-start justify-center gap-5 xl:flex-nowrap">
          <div className="flex w-52 shrink-0 flex-col gap-4">
            <section className="rounded border border-ui-gold/15 bg-black/25 p-3">
              <h3 className="mb-1 font-display text-sm tracking-wide text-ui-text-bright">
                {t("wheel.points.title")}
              </h3>
              <p className="text-center font-display text-lg text-ui-gold">
                {available} / {totalPoints}
              </p>
              {!unlocked && (
                <p className="mt-2 text-sm leading-6 text-ui-accent-light">
                  {t("wheel.locked", { level: WHEEL_LIMITS.minLevel })}
                </p>
              )}
            </section>
            <section className="rounded border border-ui-gold/15 bg-black/25 p-3">
              <h3 className="mb-2 font-display text-sm tracking-wide text-ui-text-bright">
                {t("wheel.selection.title")}
              </h3>
              <WheelSelectionPanel
                slice={infoSlice}
                points={infoPoints}
                baseVocation={baseVocation}
                editable={editable && infoSlice?.id === selectedId}
                canAdd={canAdd}
                canRemove={canRemove}
                onAddOne={() =>
                  selectedId !== null &&
                  applyChange(selectedId, selectedPoints + 1)
                }
                onAddMax={() => selectedId !== null && quickToggle(selectedId)}
                onRemoveOne={() =>
                  selectedId !== null &&
                  applyChange(selectedId, selectedPoints - 1)
                }
                onClear={() =>
                  selectedId !== null && applyChange(selectedId, 0)
                }
              />
            </section>
            <p className="px-1 text-sm leading-6 text-ui-muted">
              {t("wheel.help")}
            </p>
          </div>

          <div className="ui-scrollbar flex w-full max-w-[522px] shrink-0 overflow-x-auto pb-2">
            <WheelCanvas
              vocation={vocationKey}
              slices={draft}
              unlockableIds={unlockableIds}
              domainPoints={domainPoints}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={setSelectedId}
              onQuickToggle={quickToggle}
            />
          </div>

          <div className="w-52 shrink-0 rounded border border-ui-gold/15 bg-black/25 p-3">
            <WheelPerkSummary
              bonuses={bonuses}
              slices={draft}
              baseVocation={baseVocation}
            />
          </div>
        </div>
      )}
      {tab === "atelier" && (
        <GemAtelierTab
          gems={gems}
          vocation={baseVocation}
          resonances={resonances}
          pending={gemsPending}
          error={gemsError}
          onAction={onGemAction}
        />
      )}
      {tab === "workshop" && (
        <FragmentWorkshopTab
          gems={gems}
          vocation={baseVocation}
          pending={gemsPending}
          error={gemsError}
          onAction={onGemAction}
        />
      )}
    </Modal>
  );
}
