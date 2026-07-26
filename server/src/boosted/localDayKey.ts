/**
 * Server-local calendar day for the boost rotation, as a Postgres-ready
 * `YYYY-MM-DD` string. Canary rotates on `tm_mday` from localtime; using the
 * full local date closes its month-boundary blind spot (same day-of-month a
 * month later would not rotate there).
 */
export function localDayKey(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
