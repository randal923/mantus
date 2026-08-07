export type ToolKind =
  | "rope"
  | "shovel"
  | "machete"
  | "scythe"
  | "sickle"
  | "pick"
  | "crowbar"
  | "fire-bug"
  | "fishing-rod";

export interface ToolDefinition {
  readonly kind: ToolKind;
  /** Canary's allowFarUse: the target need not be adjacent. */
  readonly allowFarUse?: boolean;
}

/**
 * Use-with tools by catalog type id (Canary's action registrations). Items
 * listed here present a crosshair on the client and resolve authoritatively
 * in ToolUseHandler; ids match data/scripts/actions/tools in Canary, plus the
 * extra ids each tool's own allowlist in register_actions.lua accepts (the
 * "gear of eliteness" multi-tools).
 */
const TOOL_DEFINITIONS: ReadonlyMap<number, ToolDefinition> = new Map([
  [3003, { kind: "rope" }],
  [646, { kind: "rope" }], // elvenhair rope
  [3457, { kind: "shovel" }],
  [5710, { kind: "shovel" }], // light shovel
  [3308, { kind: "machete" }],
  [3453, { kind: "scythe" }],
  [3293, { kind: "sickle" }],
  [5467, { kind: "fire-bug" }],
  [9596, { kind: "scythe" }], // squeezing gear of girlpower
  [3456, { kind: "pick" }],
  [3304, { kind: "crowbar" }],
  [9598, { kind: "crowbar" }], // whacking driller of fate
  [3483, { kind: "fishing-rod", allowFarUse: true }],
]);

export function getToolDefinition(typeId: number): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.get(typeId);
}
