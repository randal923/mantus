"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Vocation } from "./characterTypes";
import { VOCATION_OPTIONS } from "./vocationOptions";

interface CreateCharacterFormProps {
  busy?: boolean;
  error?: string | null;
  /** Omit to hide the back button (e.g. when the account has no characters yet). */
  onCancel?: () => void;
  onCreate: (name: string, vocation: Vocation) => void;
}

export function CreateCharacterForm({
  busy = false,
  error,
  onCancel,
  onCreate,
}: CreateCharacterFormProps) {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");
  const [vocation, setVocation] = useState<Vocation>("Knight");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(name.trim(), vocation);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        label={t("characters.name")}
        autoComplete="off"
        spellCheck={false}
        required
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z][A-Za-z ]*"
        title={t("characters.nameRules")}
        placeholder={t("characters.namePlaceholder")}
        disabled={busy}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      {error && (
        <p
          role="alert"
          className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      <fieldset disabled={busy} className="min-w-0 has-disabled:opacity-45">
        <legend className="font-display text-[10px] font-semibold tracking-[0.18em] text-ui-gold uppercase">
          {t("characters.vocation")}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {VOCATION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-[border-color,background-color,filter] duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ui-gold/60 ${
                vocation === option.value
                  ? "border-ui-gold/60 bg-ui-accent-deep/40"
                  : "border-ui-stone-light/15 bg-black/20 hover:border-ui-stone-light/40 hover:brightness-110"
              }`}
            >
              <input
                type="radio"
                name="vocation"
                value={option.value}
                className="sr-only"
                checked={vocation === option.value}
                onChange={() => setVocation(option.value)}
              />
              <span className="font-display text-base font-semibold tracking-wide text-ui-text-bright">
                {t(`vocations.${option.value}.name`)}
              </span>
              <span className="text-xs leading-5 text-ui-muted">
                {t(`vocations.${option.value}.description`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button size="sm" disabled={busy} onClick={onCancel}>
            ‹ {t("common.back")}
          </Button>
        )}
        <Button size="sm" type="submit" variant="primary" disabled={busy}>
          {busy && (
            <span
              aria-hidden
              className="size-3 rotate-45 border border-current border-t-transparent motion-safe:animate-spin"
            />
          )}
          {busy ? t("characters.creating") : t("characters.create")}
        </Button>
      </div>
    </form>
  );
}
