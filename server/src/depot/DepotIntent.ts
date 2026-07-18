import type { ClientMessage } from "@tibia/protocol";

export type DepotIntent = Extract<
  ClientMessage,
  {
    type:
      | "depot-deposit"
      | "depot-withdraw"
      | "depot-browse"
      | "stash-deposit"
      | "stash-withdraw"
      | "close-depot"
      | "send-mail"
      | "close-mailbox";
  }
>;
