"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ChatTabs } from "./ChatTabs";
import type { ChatChannel } from "./chatTypes";
import { NewPrivateChat } from "./NewPrivateChat";

interface ChatPanelProps {
  channels: ReadonlyArray<ChatChannel>;
  initialChannelId?: string;
  /** Provide to control the active tab from the parent. */
  selectedChannelId?: string;
  pinnedOpen: boolean;
  hotkeysEnabled?: boolean;
  maxMessageLength?: number;
  onChannelSelect?: (channelId: string) => void;
  onChannelClose?: (channelId: string) => void;
  onSenderSelect?: (sender: string) => void;
  onSend?: (channelId: string, body: string) => void;
  onPinnedOpenChange: (pinnedOpen: boolean) => void;
}

export function ChatPanel({
  channels,
  initialChannelId,
  selectedChannelId: controlledChannelId,
  pinnedOpen,
  hotkeysEnabled = true,
  maxMessageLength = 280,
  onChannelSelect,
  onChannelClose,
  onSenderSelect,
  onSend,
  onPinnedOpenChange,
}: ChatPanelProps) {
  const { t } = useAppTranslation();
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLOListElement>(null);
  const [internalChannelId, setInternalChannelId] = useState(
    initialChannelId ?? channels[0]?.id ?? "",
  );
  const selectedChannelId = controlledChannelId ?? internalChannelId;
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [hovered, setHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [newPrivateChatOpen, setNewPrivateChatOpen] = useState(false);
  const newPrivateChatId = `${panelId}-new-private`;
  const activeChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const activeChannelIndex = activeChannel
    ? channels.findIndex((channel) => channel.id === activeChannel.id)
    : -1;
  const draft = activeChannel ? (drafts[activeChannel.id] ?? "") : "";
  const canSend = Boolean(activeChannel?.canSend && onSend);
  const expanded = pinnedOpen || hovered || inputFocused;
  const totalUnread = channels.reduce(
    (total, channel) =>
      channel.id === activeChannel?.id
        ? total
        : total + (channel.unreadCount ?? 0),
    0,
  );

  useEffect(() => {
    if (!expanded) return;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTop = messageList.scrollHeight;
  }, [activeChannel?.id, activeChannel?.messages.length, expanded]);

  useEffect(() => {
    if (!hotkeysEnabled || !canSend) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setInputFocused(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSend, hotkeysEnabled]);

  if (!activeChannel) return null;

  return (
    <div
      className="relative w-[28rem] max-w-[calc(100vw-2rem)] text-xs"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement) setInputFocused(true);
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLInputElement) setInputFocused(false);
      }}
    >
      {onSenderSelect && (
        <NewPrivateChat
          id={newPrivateChatId}
          open={newPrivateChatOpen}
          onClose={() => setNewPrivateChatOpen(false)}
          onOpen={onSenderSelect}
        />
      )}
      <section
        aria-label={t("chat.label")}
        className="ui-panel-frame relative isolate w-full overflow-hidden shadow-2xl"
      >
        <div
          aria-hidden
          className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.025] mix-blend-soft-light"
        />
        <ChatTabs
          panelId={panelId}
          channels={channels}
          activeChannel={activeChannel}
          expanded={expanded}
          pinnedOpen={pinnedOpen}
          totalUnread={totalUnread}
          newPrivateChatId={newPrivateChatId}
          newPrivateChatOpen={newPrivateChatOpen}
          onNewPrivateChatToggle={
            onSenderSelect
              ? () => setNewPrivateChatOpen((open) => !open)
              : undefined
          }
          onChannelClose={onChannelClose}
          onChannelSelect={(channelId) => {
            setInternalChannelId(channelId);
            onChannelSelect?.(channelId);
          }}
          onPinnedOpenChange={onPinnedOpenChange}
        />
        <div
          id={`${panelId}-content`}
          inert={!expanded}
          aria-hidden={!expanded}
          className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none ${
            expanded
              ? "grid-rows-[1fr] translate-y-0 opacity-100"
              : "grid-rows-[0fr] -translate-y-1 opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <ChatMessageList
              panelId={panelId}
              activeTabIndex={activeChannelIndex}
              channel={activeChannel}
              messageListRef={messageListRef}
              onSenderSelect={onSenderSelect}
            />
            <ChatComposer
              panelId={panelId}
              channel={activeChannel}
              draft={draft}
              canSend={canSend}
              maxMessageLength={maxMessageLength}
              inputRef={inputRef}
              onDraftChange={(nextDraft) =>
                setDrafts((current) => ({
                  ...current,
                  [activeChannel.id]: nextDraft,
                }))
              }
              onSubmit={(body) => {
                onSend?.(activeChannel.id, body);
                setDrafts((current) => ({
                  ...current,
                  [activeChannel.id]: "",
                }));
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
