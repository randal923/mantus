import { PROTOCOL_LIMITS } from "./limits";
import {
  serverMessageSchema,
  type ServerMessage,
} from "./serverMessages";

export function parseServerMessages(value: unknown): ServerMessage[] | null {
  const values = Array.isArray(value) ? value : [value];
  if (values.length > PROTOCOL_LIMITS.maxServerMessagesPerBatch) return null;
  const messages: ServerMessage[] = [];
  for (const candidate of values) {
    const parsed = serverMessageSchema.safeParse(candidate);
    if (!parsed.success) return null;
    messages.push(parsed.data);
  }
  return messages;
}
