"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 20;

interface BankTransferFormProps {
  maxAmount: number;
  disabled?: boolean;
  onSubmit: (toCharacterName: string, amount: number) => void;
}

export function BankTransferForm({
  maxAmount,
  disabled = false,
  onSubmit,
}: BankTransferFormProps) {
  const { t } = useAppTranslation();
  const [recipient, setRecipient] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const trimmedRecipient = recipient.trim();
  const amount = Number(amountInput);
  const canSubmit =
    !disabled &&
    trimmedRecipient.length >= MIN_NAME_LENGTH &&
    trimmedRecipient.length <= MAX_NAME_LENGTH &&
    amountInput !== "" &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= maxAmount;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmedRecipient, amount);
    setAmountInput("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input
        label={t("bank.recipient")}
        name="bank-transfer-recipient"
        type="text"
        maxLength={MAX_NAME_LENGTH}
        placeholder={t("bank.recipientPlaceholder")}
        value={recipient}
        onChange={(event) => setRecipient(event.currentTarget.value)}
      />
      <div className="flex items-end gap-2">
        <Input
          label={t("bank.amount")}
          name="bank-transfer-amount"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={String(maxAmount).length}
          value={amountInput}
          placeholder="0"
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (/^\d*$/.test(next)) setAmountInput(next);
          }}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="h-11"
          disabled={!canSubmit}
        >
          {t("bank.transfer")}
        </Button>
      </div>
    </form>
  );
}
