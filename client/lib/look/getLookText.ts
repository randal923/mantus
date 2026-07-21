import type { LookItemEntry } from "./loadLookItemCatalog";

/** Tibia's look line: "You see a stone pile. A worn description." */
export function getLookText(entry: LookItemEntry): string {
  const subject = entry.article ? `${entry.article} ${entry.name}` : entry.name;
  const description = entry.description ? ` ${entry.description}` : "";
  return `You see ${subject}.${description}`;
}
