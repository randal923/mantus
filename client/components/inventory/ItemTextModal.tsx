"use client";

import { useState } from "react";
import type { ServerMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

type ItemTextState = Extract<ServerMessage, { type: "item-text" }>;

interface ItemTextModalProps {
  item: ItemTextState;
  onClose(): void;
  onSave(text: string): void;
}

export function ItemTextModal({
  item,
  onClose,
  onSave,
}: ItemTextModalProps) {
  const { t } = useAppTranslation();
  const [text, setText] = useState(item.text);

  return (
    <Modal
      title={item.name}
      onClose={onClose}
      footer={
        item.writeable ? (
          <Button
            variant="primary"
            disabled={text.length > item.maxLength}
            onClick={() => onSave(text)}
          >
            {t("inventory.saveText")}
          </Button>
        ) : undefined
      }
    >
      {item.writeable ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ui-muted">
            {text.length} / {item.maxLength}
          </span>
          <textarea
            value={text}
            maxLength={item.maxLength}
            onChange={(event) => setText(event.target.value)}
            className="min-h-64 resize-y rounded-md border border-ui-stone/40 bg-black/35 p-3 text-sm text-ui-text outline-none focus:border-ui-gold/60"
          />
        </label>
      ) : (
        <p className="whitespace-pre-wrap">{item.text}</p>
      )}
    </Modal>
  );
}
