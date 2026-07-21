export interface ToolDefinition {
  readonly kind: "rope" | "shovel";
}

/**
 * Use-with tools by catalog type id (Canary's action registrations). Items
 * listed here present a crosshair on the client and resolve authoritatively
 * in ToolUseHandler; ids match data/scripts/actions/tools in Canary.
 */
const TOOL_DEFINITIONS: ReadonlyMap<number, ToolDefinition> = new Map([
  [3003, { kind: "rope" }],
  [646, { kind: "rope" }], // elvenhair rope
  [3457, { kind: "shovel" }],
  [5710, { kind: "shovel" }], // light shovel
]);

export function getToolDefinition(typeId: number): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.get(typeId);
}
