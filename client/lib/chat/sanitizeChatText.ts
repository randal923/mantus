// mirrors the protocol's chat text policy so drafts never trip the
// server's protocol-violation strikes
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/gu;

export function sanitizeChatText(raw: string): string {
  return raw.replace(CONTROL_CHARACTERS, " ").trim();
}
