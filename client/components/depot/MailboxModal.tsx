"use client";

import { useState } from "react";
import type {
  InventoryItem,
  InventorySlotEntry,
  MailActionFailedReason,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface MailboxModalProps {
  inventoryItems: ReadonlyArray<InventorySlotEntry>;
  pending: boolean;
  error: MailActionFailedReason | null;
  sentRecipient: string | null;
  onSend(item: InventoryItem, recipientName: string): void;
  onClose(): void;
}

export function MailboxModal({
  inventoryItems,
  pending,
  error,
  sentRecipient,
  onSend,
  onClose,
}: MailboxModalProps) {
  const { t } = useAppTranslation();
  const [selectedItemId, setSelectedItemId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const selectedItem = inventoryItems.find(
    ({ item }) => item.id === selectedItemId,
  )?.item;

  return (
    <Modal title={t("mail.title")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedItem) onSend(selectedItem, recipientName.trim());
        }}
      >
        <Input
          label={t("mail.recipient")}
          name="mail-recipient"
          minLength={3}
          maxLength={20}
          required
          value={recipientName}
          placeholder={t("mail.recipientPlaceholder")}
          disabled={pending}
          onChange={(event) => setRecipientName(event.currentTarget.value)}
        />

        <fieldset disabled={pending} className="min-h-0">
          <legend className="mb-2 font-display text-xs font-semibold tracking-widest text-ui-gold uppercase">
            {t("mail.item")}
          </legend>
          <div className="ui-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
            {inventoryItems.map(({ item }) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-ui-stone/25 bg-black/30 p-2 has-checked:border-ui-gold/60 has-checked:bg-ui-gold/5"
              >
                <input
                  type="radio"
                  name="mail-item"
                  value={item.id}
                  checked={selectedItemId === item.id}
                  onChange={() => setSelectedItemId(item.id)}
                  className="accent-ui-gold"
                />
                <SpriteIcon spriteId={item.spriteId} scale={1.1} />
                <span className="min-w-0 flex-1 truncate text-sm text-ui-text-bright">
                  {item.name}
                </span>
                <span className="text-sm text-ui-muted">×{item.count}</span>
              </label>
            ))}
            {inventoryItems.length === 0 && (
              <p className="py-6 text-center text-sm text-ui-muted">
                {t("mail.noItems")}
              </p>
            )}
          </div>
        </fieldset>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="border-l-2 border-red-400/60 bg-red-950/40 px-3 py-2 text-sm leading-6 text-red-200"
          >
            {t(`mail.errors.${error}`)}
          </p>
        )}
        {sentRecipient && (
          <p
            aria-live="polite"
            className="border-l-2 border-ui-gold/40 bg-ui-gold/5 px-3 py-2 text-sm leading-6 text-ui-muted"
          >
            {t("mail.sent", { recipientName: sentRecipient })}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={
            pending || !selectedItem || recipientName.trim().length < 3
          }
        >
          {t("mail.send")}
        </Button>
      </form>
    </Modal>
  );
}
