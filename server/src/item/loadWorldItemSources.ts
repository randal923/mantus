import type {
  WorldItemSourceContent,
  WorldItemSourceData,
} from "./WorldItemSource";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseContents(
  values: ReadonlyArray<unknown>,
  parentKey: string,
  depth: number,
): WorldItemSourceContent[] {
  if (depth > 8 || values.length > 100) {
    throw new Error(`world container ${parentKey} exceeds content bounds`);
  }
  return values.map((value, slot) => {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.id) ||
      Number(value.id) < 1 ||
      Number(value.id) > 65_535 ||
      !isRecord(value.attributes) ||
      !Array.isArray(value.contents)
    ) {
      throw new Error(`world container ${parentKey} has invalid content`);
    }
    const itemKey = `${parentKey}:content:${slot}`;
    return {
      typeId: Number(value.id),
      attributes: value.attributes,
      contents: parseContents(value.contents, itemKey, depth + 1),
    };
  });
}

export function loadWorldItemSources(
  buffer: Buffer,
  mapName: string,
): ReadonlyMap<string, WorldItemSourceData> {
  const parsed: unknown = JSON.parse(buffer.toString("utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.worldItemAttributes)) {
    throw new Error(`${mapName}.content.json has invalid item attributes`);
  }
  const sources = new Map<string, WorldItemSourceData>();
  for (const value of parsed.worldItemAttributes) {
    if (
      !isRecord(value) ||
      typeof value.instanceId !== "string" ||
      value.instanceId.length < 1 ||
      value.instanceId.length > 128 ||
      !isRecord(value.attributes) ||
      !Array.isArray(value.contents)
    ) {
      throw new Error(`${mapName}.content.json has malformed item data`);
    }
    if (sources.has(value.instanceId)) {
      throw new Error(`${mapName}.content.json repeats an item instance`);
    }
    sources.set(value.instanceId, {
      attributes: value.attributes,
      contents: parseContents(value.contents, value.instanceId, 1),
    });
  }
  return sources;
}
