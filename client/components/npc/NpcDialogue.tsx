"use client";

import type { NpcDialogueMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface NpcDialogueProps {
  dialogue: NpcDialogueMessage;
  travelPending: boolean;
  onChoice: (choice: NpcDialogueMessage["options"][number]) => void;
}

export function NpcDialogue({
  dialogue,
  travelPending,
  onChoice,
}: NpcDialogueProps) {
  const { t } = useAppTranslation();

  return (
    <section
      role="dialog"
      aria-label={t("npc.dialogueLabel", { name: dialogue.npcName })}
      aria-busy={travelPending}
      className="ui-panel-frame pointer-events-auto flex w-full max-w-xl flex-col gap-3 p-4 font-tibia text-ui-text shadow-2xl"
    >
      <h2 className="font-display text-lg font-semibold text-ui-text-bright">
        {dialogue.npcName}
      </h2>
      <p aria-live="polite" className="text-sm leading-relaxed">
        {dialogue.text}
      </p>
      {dialogue.options.length > 0 && (
        <div
          role="group"
          aria-label={t("npc.responsesLabel")}
          className="flex flex-wrap gap-2"
        >
          {dialogue.options.map((option) => (
            <Button
              key={option.id}
              size="sm"
              disabled={travelPending}
              onClick={() => onChoice(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      {travelPending && (
        <p role="status" className="text-sm text-ui-gold">
          {t("npc.sailing")}
        </p>
      )}
    </section>
  );
}
