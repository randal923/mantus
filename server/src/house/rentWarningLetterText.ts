import { HOUSE_LIMITS } from "@tibia/protocol";
import type { HouseInfo } from "./HouseInfo";

/**
 * The stamped letter Canary mails with every rent warning. Wording follows
 * the pinned baseline so the in-game notice reads the same; the numbers come
 * from the same static content the charge itself used.
 */
export function rentWarningLetterText(
  info: HouseInfo,
  warningsLeft: number,
): string {
  const kind = info.guildhall ? "guildhall" : "house";
  return (
    `Warning! \nThe monthly rent of ${info.rent} gold for your ${kind} ` +
    `"${info.name}" is payable. Have it within ${warningsLeft} day(s) or ` +
    `you will lose this ${kind}. ` +
    `You have ${HOUSE_LIMITS.maxWarnings - warningsLeft} unpaid ` +
    `period(s) on record.`
  );
}
