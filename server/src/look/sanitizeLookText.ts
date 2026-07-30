/**
 * Keeps a composed look line inside the protocol's text rule: newlines
 * separate Canary's description lines, every other control character is
 * dropped so a stray byte in a content artifact can never produce a message
 * the client must reject.
 */
export function sanitizeLookText(text: string): string {
  return [...text]
    .filter((character) => character === "\n" || !/\p{Cc}/u.test(character))
    .join("");
}
