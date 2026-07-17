import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  CHAT_ACTIVE_TAB_CLASS,
  CHAT_CHANNEL_DOT_CLASS,
} from "./chatStyles";
import type { ChatChannel } from "./chatTypes";

interface ChatTabsProps {
  panelId: string;
  channels: ReadonlyArray<ChatChannel>;
  activeChannel: ChatChannel;
  minimized: boolean;
  totalUnread: number;
  onChannelSelect: (channelId: string) => void;
  onMinimizedChange: (minimized: boolean) => void;
}

export function ChatTabs({
  panelId,
  channels,
  activeChannel,
  minimized,
  totalUnread,
  onChannelSelect,
  onMinimizedChange,
}: ChatTabsProps) {
  const { t } = useAppTranslation();

  return (
    <header className="relative flex h-10 border-b border-ui-stone-light/20 bg-black/35">
      <div
        role="tablist"
        aria-label={t("chat.channelsLabel")}
        className="ui-scrollbar flex min-w-0 flex-1 overflow-x-auto"
      >
        {channels.map((channel, index) => {
          const active = channel.id === activeChannel.id;
          const unreadCount = active ? 0 : (channel.unreadCount ?? 0);

          return (
            <button
              key={channel.id}
              id={`${panelId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${panelId}-messages`}
              aria-label={
                unreadCount > 0
                  ? t("chat.channelWithUnread", {
                      channel: channel.label,
                      count: unreadCount,
                    })
                  : channel.label
              }
              title={channel.description ?? channel.label}
              onClick={() => onChannelSelect(channel.id)}
              className={`relative flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 font-medium outline-none transition-[color,background-color,border-color] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-gold/60 ${
                active
                  ? CHAT_ACTIVE_TAB_CLASS[channel.kind]
                  : "border-transparent text-ui-muted hover:bg-white/5 hover:text-ui-text-bright"
              }`}
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full shadow-[0_0_7px_currentColor] ${CHAT_CHANNEL_DOT_CLASS[channel.kind]}`}
              />
              <span>{channel.label}</span>
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="min-w-4 rounded-full bg-ui-accent px-1 text-center text-xs font-bold leading-4 text-white shadow-sm shadow-black"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-expanded={!minimized}
        aria-controls={`${panelId}-content`}
        aria-label={minimized ? t("chat.restore") : t("chat.minimize")}
        title={minimized ? t("chat.restore") : t("chat.minimize")}
        onClick={() => onMinimizedChange(!minimized)}
        className="relative flex w-10 shrink-0 items-center justify-center border-l border-ui-stone-light/20 text-ui-muted outline-none transition-colors hover:bg-white/5 hover:text-ui-text-bright focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-gold/60"
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`size-4 transition-transform motion-reduce:transition-none ${minimized ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
        </svg>
        {minimized && totalUnread > 0 && (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-ui-accent-light shadow-[0_0_6px_currentColor]" />
        )}
      </button>
    </header>
  );
}
