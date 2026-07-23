"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface BankAmountFormProps {
  name: string;
  submitLabel: string;
  maxAmount: number;
  disabled?: boolean;
  onSubmit: (amount: number) => void;
}

export function BankAmountForm({
  name,
  submitLabel,
  maxAmount,
  disabled = false,
  onSubmit,
}: BankAmountFormProps) {
  const { t } = useAppTranslation();
  const [amountInput, setAmountInput] = useState("");
  const amount = Number(amountInput);
  const canSubmit =
    !disabled &&
    amountInput !== "" &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= maxAmount;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(amount);
    setAmountInput("");
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Input
        label={t("bank.amount")}
        name={name}
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
        type="button"
        size="sm"
        className="h-11"
        disabled={disabled || maxAmount === 0}
        onClick={() => setAmountInput(String(maxAmount))}
      >
        {t("bank.all")}
      </Button>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        className="h-11"
        disabled={!canSubmit}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
