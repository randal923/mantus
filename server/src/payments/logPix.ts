type PixLogValue = string | number | boolean | null | undefined;

/**
 * One grep-able line per payment event: `pix.<event> key=value ...`. Every
 * order/payment transition in the Pix flow goes through here so an incident
 * can be reconstructed from the server log alone (order id, account id and
 * provider payment id are the join keys into `pix_orders` and `audit_log`).
 * Callers never pass secrets, brcodes, e-mails or raw provider bodies.
 */
export function logPix(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, PixLogValue> = {},
): void {
  const parts = [`pix.${event}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key}=${formatValue(value)}`);
  }
  const line = parts.join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function formatValue(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return /^[\w.:+@/-]*$/.test(value) ? value : JSON.stringify(value);
  }
  return String(value);
}
