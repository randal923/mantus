"use client";

import {
  computeWheelBonuses,
  WHEEL_BASE_VOCATION,
  WHEEL_LIMITS,
  WHEEL_SLICES,
  type CharacterVocation,
  type WheelActionFailedReason,
  type WheelStateMessage,
} from "@tibia/protocol";
import { useEffect, useMemo, useState } from "react";
import { trySetWheelSlice } from "../../lib/wheel/trySetWheelSlice";
import { wheelBaseVocationKey } from "../../lib/wheel/wheelBaseVocationKey";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { WheelCanvas } from "./WheelCanvas";
import { WheelPerkSummary } from "./WheelPerkSummary";
import { WheelSelectionPanel } from "./WheelSelectionPanel";

interface WheelModalProps {
  wheel: WheelStateMessage | null;
  vocation: CharacterVocation;
  pending: boolean;
  error: WheelActionFailedReason | null;
  onSave: (slices: ReadonlyArray<number>) => void;
  onClose: () => void;
}

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

/**
 * Wheel of Destiny window: the Tibia wheel in the center, allocation
 * controls on the left, live perk summary on the right. Edits are a local
 * draft; the server applies and re-validates on save.
 */
export function WheelModal({
  wheel,
  vocation,
  pending,
  error,
  onSave,
  onClose,
}: WheelModalProps) {
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState<number[]>(emptySlices);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const serverSlices = wheel?.slices;
  useEffect(() => {
    // Sync the draft whenever the server acknowledges a new projection.
    setDraft(serverSlices ? [...serverSlices] : emptySlices());
  }, [serverSlices]);

  const totalPoints = wheel?.totalPoints ?? 0;
  const unlocked = wheel?.unlocked ?? false;
  const editable = unlocked && !pending;
  const baseVocation = WHEEL_BASE_VOCATION[vocation];
  const vocationKey = wheelBaseVocationKey(vocation);

  const allocated = draft.reduce((sum, points) => sum + points, 0);
  const available = Math.max(0, totalPoints - allocated);

  const bonuses = useMemo(
    () => computeWheelBonuses(draft, vocation),
    [draft, vocation],
  );

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
      size="wide"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-ui-muted">
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
      }
    >
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
              <p className="mt-2 text-xs leading-5 text-ui-accent-light">
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
              onClear={() => selectedId !== null && applyChange(selectedId, 0)}
            />
          </section>
          <p className="px-1 text-[10px] leading-4 text-ui-muted">
            {t("wheel.help")}
          </p>
        </div>

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

        <div className="w-52 shrink-0 rounded border border-ui-gold/15 bg-black/25 p-3">
          <WheelPerkSummary
            bonuses={bonuses}
            slices={draft}
            baseVocation={baseVocation}
          />
        </div>
      </div>
    </Modal>
  );
}
