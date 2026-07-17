"use client";

import { PROTOCOL_LIMITS } from "@tibia/protocol";
import { useEffect, useRef, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface NewPrivateChatProps {
  id: string;
  open: boolean;
  onClose: () => void;
  onOpen: (counterpart: string) => void;
}

export function NewPrivateChat({
  id,
  open,
  onClose,
  onOpen,
}: NewPrivateChatProps) {
  const { t } = useAppTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <form
      id={id}
      inert={!open}
      aria-hidden={!open}
      className={`ui-panel-frame absolute right-0 bottom-full z-10 flex w-64 origin-bottom items-center gap-1.5 p-2 shadow-2xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        open
          ? "translate-y-0 scale-y-100 opacity-100"
          : "pointer-events-none translate-y-1 scale-y-75 opacity-0"
      }`}
      onSubmit={(event) => {
        event.preventDefault();
        const counterpart = name.trim();
        if (
          counterpart.length < PROTOCOL_LIMITS.minCharacterNameLength ||
          counterpart.length > PROTOCOL_LIMITS.maxCharacterNameLength ||
          !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(counterpart)
        ) {
          return;
        }
        onOpen(counterpart);
        setName("");
        onClose();
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        {t("chat.playerName")}
      </label>
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="text"
        required
        autoComplete="off"
        data-1p-ignore="true"
        spellCheck={false}
        minLength={PROTOCOL_LIMITS.minCharacterNameLength}
        maxLength={PROTOCOL_LIMITS.maxCharacterNameLength}
        pattern="[A-Za-z]+(?: [A-Za-z]+)*"
        title={t("chat.playerNameRules")}
        placeholder={t("chat.playerName")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onClose();
        }}
        className="h-8 min-w-0 flex-1 rounded border border-ui-stone/50 bg-black/45 px-2 text-sm text-ui-text shadow-inner shadow-black/40 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ui-muted/55 hover:border-ui-stone-light/45 focus:border-ui-gold/60 focus:bg-black/60 focus:ring-2 focus:ring-ui-gold/15"
      />
      <button
        type="submit"
        disabled={name.trim().length === 0}
        aria-label={t("chat.openPrivate")}
        title={t("chat.openPrivate")}
        className="ui-button ui-button-primary flex size-8 shrink-0 items-center justify-center rounded border border-ui-accent-light/50 text-ui-text-bright outline-none transition-[filter,transform] hover:-translate-y-px hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-35"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m7 4 6 6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t("common.cancel")}
        title={t("common.cancel")}
        onClick={onClose}
        className="flex size-8 shrink-0 items-center justify-center rounded text-ui-muted outline-none transition-colors hover:bg-white/10 hover:text-ui-text-bright focus-visible:ring-2 focus-visible:ring-ui-gold/60"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      </button>
    </form>
  );
}
