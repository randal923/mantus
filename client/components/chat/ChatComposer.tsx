import type { RefObject } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  CHAT_CHANNEL_MARK,
  CHAT_CHANNEL_TEXT_CLASS,
} from "./chatStyles";
import type { ChatChannel } from "./chatTypes";

interface ChatComposerProps {
  panelId: string;
  channel: ChatChannel;
  draft: string;
  canSend: boolean;
  maxMessageLength: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: string) => void;
  onSubmit: (body: string) => void;
}

export function ChatComposer({
  panelId,
  channel,
  draft,
  canSend,
  maxMessageLength,
  inputRef,
  onDraftChange,
  onSubmit,
}: ChatComposerProps) {
  const { t } = useAppTranslation();
  const inputLabel = t("chat.messageLabel", { channel: channel.label });

  return (
    <form
      className="flex h-12 items-center gap-2 border-t border-ui-stone-light/15 bg-ui-panel-deep/85 px-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = draft.trim();
        if (!canSend) return;
        if (body.length === 0) {
          inputRef.current?.blur();
          return;
        }
        if (body.length > maxMessageLength) return;
        onSubmit(body);
        inputRef.current?.blur();
      }}
    >
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded border border-current/20 bg-black/25 font-bold ${CHAT_CHANNEL_TEXT_CLASS[channel.kind]}`}
      >
        {CHAT_CHANNEL_MARK[channel.kind]}
      </span>
      <label htmlFor={`${panelId}-input`} className="sr-only">
        {inputLabel}
      </label>
      <input
        ref={inputRef}
        id={`${panelId}-input`}
        type="text"
        value={draft}
        maxLength={maxMessageLength}
        disabled={!canSend}
        autoComplete="off"
        placeholder={
          canSend
            ? t("chat.placeholder", { channel: channel.label })
            : t("chat.readOnly")
        }
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && draft.trim().length === 0) {
            event.preventDefault();
            event.currentTarget.blur();
            return;
          }
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        className="h-8 min-w-0 flex-1 rounded border border-ui-stone/50 bg-black/45 px-2.5 text-sm text-ui-text shadow-inner shadow-black/40 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ui-muted/55 hover:border-ui-stone-light/45 focus:border-ui-gold/60 focus:bg-black/60 focus:ring-2 focus:ring-ui-gold/15 disabled:cursor-not-allowed disabled:opacity-55"
      />
      <button
        type="submit"
        disabled={!canSend || draft.trim().length === 0}
        aria-label={t("chat.send")}
        title={t("chat.send")}
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
          <path d="m3 3 14 7-14 7 2.5-7zM5.5 10H17" />
        </svg>
      </button>
    </form>
  );
}
