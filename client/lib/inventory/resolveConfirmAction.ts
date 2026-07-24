/**
 * What an incoming `inventory-updated` should do to the optimistic queue.
 * - `advance-preview`: settle the oldest external (shop/storage) prediction.
 * - `advance-drag`: the in-flight drag's own confirmation — pop it.
 * - `patch-only`: an unsolicited change (potion/food/decay, or an update whose
 *   nonce does not match the in-flight drag). Refresh the confirmed state but
 *   leave the queue untouched so the in-flight op is not settled early.
 */
export type ConfirmAction = "advance-preview" | "advance-drag" | "patch-only";

export function resolveConfirmAction(input: {
  readonly hasPreview: boolean;
  readonly inFlight: boolean;
  readonly echoedNonce: string | undefined;
  readonly inFlightNonce: string | null;
}): ConfirmAction {
  if (input.hasPreview) return "advance-preview";
  if (
    input.inFlight &&
    input.echoedNonce !== undefined &&
    input.echoedNonce === input.inFlightNonce
  ) {
    return "advance-drag";
  }
  return "patch-only";
}
