const FLOOR_CHANGES = new Set([
  "down",
  "north",
  "south",
  "southalt",
  "west",
  "east",
  "eastalt",
]);

const ITEM_TYPES = new Set([
  "bed",
  "carpet",
  "container",
  "depot",
  "door",
  "dummy",
  "key",
  "ladder",
  "magicfield",
  "mailbox",
  "rewardchest",
  "rune",
  "teleport",
  "trashholder",
]);

function tagAttributes(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)) {
    attributes.set(match[1].toLowerCase(), match[2]);
  }
  return attributes;
}

function integer(value, label) {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be an integer`);
  return Number(value);
}

function boolean(value, label) {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`${label} must be 0, 1, true, or false`);
}

function itemIds(attributes) {
  const id = attributes.get("id");
  if (id !== undefined) return [integer(id, "item id")];
  const from = attributes.get("fromid");
  const to = attributes.get("toid");
  if (from === undefined || to === undefined) {
    throw new Error("item must declare id or fromid/toid");
  }
  const first = integer(from, "item fromid");
  const last = integer(to, "item toid");
  if (last < first) throw new Error(`item range ${first}..${last} is reversed`);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function applyAttribute(semantics, attributes, itemLabel) {
  const key = attributes.get("key")?.toLowerCase();
  const value = attributes.get("value")?.toLowerCase();
  if (!key || value === undefined) return;
  switch (key) {
    case "type":
      if (ITEM_TYPES.has(value)) semantics.type = value;
      return;
    case "floorchange":
      if (!FLOOR_CHANGES.has(value)) {
        throw new Error(`${itemLabel} has unknown floorchange ${value}`);
      }
      semantics.floorChange = value;
      return;
    case "movable":
      semantics.movable = boolean(value, `${itemLabel} movable`);
      return;
    case "blockprojectile":
      semantics.blocksProjectile = boolean(
        value,
        `${itemLabel} blockprojectile`,
      );
      return;
    case "pickupable":
    case "allowpickupable":
      semantics.pickupable = boolean(value, `${itemLabel} pickupable`);
      return;
    case "containersize":
      semantics.containerSize = integer(value, `${itemLabel} containersize`);
      return;
    case "walkstack":
      semantics.walkStack = boolean(value, `${itemLabel} walkstack`);
      return;
    case "blocking":
      semantics.blocking = boolean(value, `${itemLabel} blocking`);
      return;
    case "charges":
      semantics.charges = integer(value, `${itemLabel} charges`);
  }
}

export function parseCanaryItemSemantics(xml) {
  const items = new Map();
  let current = null;
  let attributeDepth = 0;
  const tokens = xml.matchAll(/<!--[\s\S]*?-->|<\/?(?:item|attribute)\b[^>]*>/gi);
  for (const match of tokens) {
    const token = match[0];
    if (token.startsWith("<!--")) continue;
    const closing = /^<\//.test(token);
    const itemTag = /^<\/?item\b/i.test(token);
    if (itemTag && closing) {
      if (!current) throw new Error("unexpected closing item tag");
      for (const id of current.ids) {
        if (items.has(id)) throw new Error(`item ${id} is defined more than once`);
        if (Object.keys(current.semantics).length > 0) {
          items.set(id, { ...current.semantics });
        }
      }
      current = null;
      attributeDepth = 0;
      continue;
    }
    if (itemTag) {
      if (current) throw new Error("nested item definitions are not supported");
      const attributes = tagAttributes(token);
      const name = attributes.get("name");
      current = {
        ids: itemIds(attributes),
        semantics: name ? { name } : {},
      };
      if (/\/>$/.test(token)) {
        for (const id of current.ids) {
          if (items.has(id)) throw new Error(`item ${id} is defined more than once`);
          if (Object.keys(current.semantics).length > 0) {
            items.set(id, { ...current.semantics });
          }
        }
        current = null;
      }
      continue;
    }
    if (!current) continue;
    if (closing) {
      if (attributeDepth === 0) throw new Error("unexpected closing attribute tag");
      attributeDepth -= 1;
      continue;
    }
    if (attributeDepth === 0) {
      applyAttribute(
        current.semantics,
        tagAttributes(token),
        `item ${current.ids[0]}`,
      );
    }
    if (!/\/>$/.test(token)) attributeDepth += 1;
  }
  if (current) throw new Error("unterminated item definition");
  return Object.fromEntries([...items.entries()].sort((a, b) => a[0] - b[0]));
}
