import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("NPC intent schema", () => {
  it("accepts only a bounded NPC reference for targeted greetings", () => {
    const message = {
      type: "npc-dialogue-greet",
      npcId: "npc:captain-bluebear:1",
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ ...message, npcId: "" }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, npcId: "n".repeat(193) })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ ...message, greeting: "hi" }).success,
    ).toBe(false);
  });

  it("accepts only an opaque server-issued conversation and choice", () => {
    const message = {
      type: "npc-dialogue-choice",
      npcId: "npc:captain-bluebear:1",
      conversationId: "da29db8c-33a7-4935-a056-3f9dd87bafcc",
      choiceId: "confirm-carlin",
    };

    expect(clientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        price: 0,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        destination: { x: 1, y: 1, z: 7 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...message,
        conversationId: "not-a-server-reference",
      }).success,
    ).toBe(false);
  });
});
