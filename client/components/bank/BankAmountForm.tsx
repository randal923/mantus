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
  const [amount, setAmount] = useState(0);
  const canSubmit =
    !disabled && Number.isInteger(amount) && amount > 0 && amount <= maxAmount;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(amount);
    setAmount(0);
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Input
        label={t("bank.amount")}
        name={name}
        type="number"
        min={1}
        max={maxAmount}
        step={1}
        inputMode="numeric"
        value={amount === 0 ? "" : amount}
        placeholder="0"
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          setAmount(Number.isFinite(next) ? Math.trunc(next) : 0);
        }}
        className="min-w-0 flex-1"
      />
      <Button
        type="button"
        size="sm"
        className="h-11"
        disabled={disabled || maxAmount === 0}
        onClick={() => setAmount(maxAmount)}
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
