import type { RefObject } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  CHAT_CHANNEL_MARK,
  CHAT_CHANNEL_TEXT_CLASS,
  CHAT_MESSAGE_CLASS,
} from "./chatStyles";
import type { ChatChannel } from "./chatTypes";

const MAX_VISIBLE_MESSAGES = 200;

interface ChatMessageListProps {
  panelId: string;
  activeTabIndex: number;
  channel: ChatChannel;
  messageListRef: RefObject<HTMLOListElement | null>;
  onSenderSelect?: (sender: string) => void;
}

export function ChatMessageList({
  panelId,
  activeTabIndex,
  channel,
  messageListRef,
  onSenderSelect,
}: ChatMessageListProps) {
  const { t } = useAppTranslation();
  const visibleMessages = channel.messages.slice(-MAX_VISIBLE_MESSAGES);

  return (
    <>
      <div className="flex h-8 items-center gap-2 border-b border-ui-stone-light/10 bg-ui-panel-deep/55 px-3 text-ui-muted">
        <span
          aria-hidden
          className={`font-bold ${CHAT_CHANNEL_TEXT_CLASS[channel.kind]}`}
        >
          {CHAT_CHANNEL_MARK[channel.kind]}
        </span>
        <p className="min-w-0 flex-1 truncate">
          {channel.description ??
            t("chat.channelDescription", { channel: channel.label })}
        </p>
        <span className="shrink-0 tabular-nums text-ui-muted/70">
          {t("chat.messageCount", { count: channel.messages.length })}
        </span>
      </div>

      <ol
        ref={messageListRef}
        id={`${panelId}-messages`}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-labelledby={`${panelId}-tab-${activeTabIndex}`}
        className="ui-scrollbar h-48 space-y-1 overflow-y-auto bg-black/20 px-3 py-2.5"
      >
        {visibleMessages.length === 0 ? (
          <li className="flex h-full flex-col items-center justify-center gap-2 text-center text-ui-muted">
            <span aria-hidden className="text-xl text-ui-stone-light/60">
              {CHAT_CHANNEL_MARK[channel.kind]}
            </span>
            <span>{t("chat.empty")}</span>
          </li>
        ) : (
          visibleMessages.map((message) => {
            const sender = message.sender;

            return (
              <li
                key={message.id}
                className="flex min-w-0 items-start gap-2 leading-relaxed"
              >
                {message.time && (
                  <time className="shrink-0 pt-px text-ui-muted/60 tabular-nums">
                    {message.time}
                  </time>
                )}
                <p className="min-w-0 break-words">
                  {sender && (
                    <>
                      {onSenderSelect ? (
                        <button
                          type="button"
                          onClick={() => onSenderSelect(sender)}
                          className={`font-semibold outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                            message.isOwn
                              ? "text-ui-gold"
                              : "text-ui-text-bright"
                          }`}
                        >
                          {sender}
                        </button>
                      ) : (
                        <span
                          className={`font-semibold ${
                            message.isOwn
                              ? "text-ui-gold"
                              : "text-ui-text-bright"
                          }`}
                        >
                          {sender}
                        </span>
                      )}
                      <span className="text-ui-muted">: </span>
                    </>
                  )}
                  <span
                    className={CHAT_MESSAGE_CLASS[message.tone ?? "default"]}
                  >
                    {message.body}
                  </span>
                </p>
              </li>
            );
          })
        )}
      </ol>
    </>
  );
}
