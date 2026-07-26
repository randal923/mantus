"use client";

import type { QuestLineMessage, QuestLogMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";

interface QuestLogModalProps {
  log: QuestLogMessage | null;
  line: QuestLineMessage | null;
  error: string | null;
  onSelectQuest: (questId: number) => void;
  onClose: () => void;
}

/**
 * The quest log (Feature 104): started quests on the left, the selected
 * quest's started missions on the right. Both lists are server-evaluated
 * projections of the owner's storages; the client only requests.
 */
export function QuestLogModal({
  log,
  line,
  error,
  onSelectQuest,
  onClose,
}: QuestLogModalProps) {
  const { t } = useAppTranslation();
  return (
    <Modal title={t("questLog.title")} onClose={onClose} size="wide">
      <div className="flex max-h-[26rem] min-h-64 gap-3">
        <ul className="ui-scrollbar w-56 shrink-0 overflow-y-auto pr-1">
          {(log?.quests ?? []).map((quest) => (
            <li key={quest.questId}>
              <button
                type="button"
                aria-pressed={line?.questId === quest.questId}
                onClick={() => onSelectQuest(quest.questId)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${
                  line?.questId === quest.questId
                    ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                    : "border-transparent hover:border-ui-gold/40"
                }`}
              >
                <span className="min-w-0 truncate">{quest.name}</span>
                {quest.completed && (
                  <span
                    aria-label={t("questLog.completed")}
                    className="text-ui-success"
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
          {log !== null && log.quests.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-ui-muted">
              {t("questLog.empty")}
            </li>
          )}
          {log === null && (
            <li className="px-3 py-6 text-center text-sm text-ui-muted">
              {t("questLog.loading")}
            </li>
          )}
        </ul>
        <div className="ui-scrollbar min-w-0 flex-1 overflow-y-auto border-l border-ui-stone-light/20 pl-3">
          {error && <p className="text-sm text-ui-accent-light">{error}</p>}
          {line ? (
            <>
              <h3 className="mb-2 text-sm font-medium text-ui-text-bright">
                {line.name}
              </h3>
              <ul className="space-y-3">
                {line.missions.map((mission) => (
                  <li key={mission.missionId}>
                    <div className="text-sm text-ui-text-bright">
                      {mission.name}
                      {mission.completed && (
                        <span className="ml-2 text-xs text-ui-success">
                          {t("questLog.completedSuffix")}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-line text-sm text-ui-muted">
                      {mission.description}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !error && (
              <p className="py-6 text-center text-sm text-ui-muted">
                {t("questLog.selectPrompt")}
              </p>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
