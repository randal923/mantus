import type { TFunction } from "i18next";
import { describe, expect, test } from "vitest";
import { toChatMessage } from "./toChatMessage";

const t = ((key: string, options?: { seconds?: number }) =>
  options?.seconds !== undefined
    ? `${key}:${options.seconds}`
    : key) as unknown as TFunction;

describe("toChatMessage", () => {
  test("localizes a rejection notice with rounded-up seconds", () => {
    expect(
      toChatMessage(
        {
          id: 4,
          kind: "notice",
          reason: "muted",
          retryAfterMs: 1_400,
          time: "12:00",
        },
        t,
      ),
    ).toEqual({
      id: "entry:4",
      body: "chat.rejected.muted:2",
      time: "12:00",
      tone: "notice",
    });
  });

  test("keeps ordinary speech verbatim with sender and own flags", () => {
    expect(
      toChatMessage(
        {
          id: 7,
          kind: "speech",
          sender: "Alice",
          body: "hello there",
          time: "12:01",
          isOwn: true,
        },
        t,
      ),
    ).toEqual({
      id: "entry:7",
      body: "hello there",
      time: "12:01",
      tone: "default",
      sender: "Alice",
      isOwn: true,
    });
  });

  test("colors monster and spell lines as monster say", () => {
    const monster = toChatMessage(
      {
        id: 9,
        kind: "speech",
        sender: "Orc",
        body: "grr",
        time: "12:02",
        isOwn: false,
        mode: "monster-say",
      },
      t,
    );
    expect(monster.tone).toBe("monster");
    const spell = toChatMessage(
      {
        id: 10,
        kind: "speech",
        sender: "Alice",
        body: "exura",
        time: "12:03",
        isOwn: false,
        mode: "magic",
      },
      t,
    );
    expect(spell.tone).toBe("monster");
  });

  test("highlights privileged speakers as loot tone", () => {
    expect(
      toChatMessage(
        {
          id: 11,
          kind: "speech",
          sender: "Leader",
          body: "raid at dawn",
          time: "12:04",
          isOwn: false,
          highlighted: true,
        },
        t,
      ).tone,
    ).toBe("loot");
  });
});
