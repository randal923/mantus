export type ToolKind =
  | "rope"
  | "shovel"
  | "machete"
  | "scythe"
  | "sickle"
  | "pick"
  | "crowbar"
  | "fire-bug"
  | "fishing-rod"
  | "key";

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
  // Keys (Canary key_door.lua's keysID list): used on a door whose ActionId
  // matches the key's own.
  [2967, { kind: "key" }], // magical key
  [2968, { kind: "key" }], // wooden key
  [2969, { kind: "key" }], // silver key
  [2970, { kind: "key" }], // copper key
  [2971, { kind: "key" }], // crystal key
  [2972, { kind: "key" }], // golden key
  [2973, { kind: "key" }], // bone key
  [21392, { kind: "key" }], // key to the drowned library
]);

export function getToolDefinition(typeId: number): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.get(typeId);
}
