"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { isEditableTarget } from "../../lib/hotkeys/isEditableTarget";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ChatTabs } from "./ChatTabs";
import type { ChatChannel } from "./chatTypes";

interface ChatPanelProps {
  channels: ReadonlyArray<ChatChannel>;
  initialChannelId?: string;
  /** Provide to control the active tab from the parent. */
  selectedChannelId?: string;
  initiallyMinimized?: boolean;
  hotkeysEnabled?: boolean;
  maxMessageLength?: number;
  onChannelSelect?: (channelId: string) => void;
  onSenderSelect?: (sender: string) => void;
  onSend?: (channelId: string, body: string) => void;
}

export function ChatPanel({
  channels,
  initialChannelId,
  selectedChannelId: controlledChannelId,
  initiallyMinimized = false,
  hotkeysEnabled = true,
  maxMessageLength = 280,
  onChannelSelect,
  onSenderSelect,
  onSend,
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
  const [minimized, setMinimized] = useState(initiallyMinimized);
  const activeChannel =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const activeChannelIndex = activeChannel
    ? channels.findIndex((channel) => channel.id === activeChannel.id)
    : -1;
  const draft = activeChannel ? (drafts[activeChannel.id] ?? "") : "";
  const canSend = Boolean(activeChannel?.canSend && onSend);
  const totalUnread = channels.reduce(
    (total, channel) =>
      channel.id === activeChannel?.id
        ? total
        : total + (channel.unreadCount ?? 0),
    0,
  );

  useEffect(() => {
    if (minimized) return;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTop = messageList.scrollHeight;
  }, [activeChannel?.id, activeChannel?.messages.length, minimized]);

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
      setMinimized(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSend, hotkeysEnabled]);

  if (!activeChannel) return null;

  return (
    <section
      aria-label={t("chat.label")}
      className="ui-panel-frame relative isolate w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden text-xs shadow-2xl"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.025] mix-blend-soft-light"
      />
      <ChatTabs
        panelId={panelId}
        channels={channels}
        activeChannel={activeChannel}
        minimized={minimized}
        totalUnread={totalUnread}
        onChannelSelect={(channelId) => {
          setInternalChannelId(channelId);
          onChannelSelect?.(channelId);
        }}
        onMinimizedChange={setMinimized}
      />
      <div
        id={`${panelId}-content`}
        inert={minimized}
        aria-hidden={minimized}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none ${
          minimized
            ? "grid-rows-[0fr] -translate-y-1 opacity-0"
            : "grid-rows-[1fr] translate-y-0 opacity-100"
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
  );
}
