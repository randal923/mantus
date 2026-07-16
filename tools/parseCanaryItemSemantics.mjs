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
  if (!/^-?\d+$/.test(value)) throw new Error(`${label} must be an integer`);
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

function setNumber(semantics, property, value, itemLabel) {
  semantics[property] = integer(value, `${itemLabel} ${property}`);
}

function setAbsorbPercent(semantics, damageType, value, itemLabel) {
  semantics.absorbPercent ??= {};
  semantics.absorbPercent[damageType] = integer(
    value,
    `${itemLabel} absorbpercent${damageType}`,
  );
}

function setSkillModifier(semantics, skill, value, itemLabel) {
  semantics.skillModifiers ??= {};
  semantics.skillModifiers[skill] = integer(
    value,
    `${itemLabel} skill${skill}`,
  );
}

function applyAttribute(semantics, attributes, itemLabel) {
  const key = attributes.get("key")?.toLowerCase();
  const rawValue = attributes.get("value");
  const value = rawValue?.toLowerCase();
  if (!key || value === undefined || rawValue === undefined) return;
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
      setNumber(semantics, "charges", value, itemLabel);
      return;
    case "primarytype":
      semantics.primaryType = rawValue;
      return;
    case "description":
      semantics.description = rawValue;
      return;
    case "weight":
      setNumber(semantics, "weight", value, itemLabel);
      return;
    case "weapontype":
      semantics.weaponType = value;
      return;
    case "slottype":
      semantics.slotType = value;
      return;
    case "ammotype":
      semantics.ammoType = value;
      return;
    case "shoottype":
      semantics.shootType = value;
      return;
    case "attack":
      setNumber(semantics, "attack", value, itemLabel);
      return;
    case "defense":
      setNumber(semantics, "defense", value, itemLabel);
      return;
    case "extradef":
      setNumber(semantics, "extraDefense", value, itemLabel);
      return;
    case "armor":
      setNumber(semantics, "armor", value, itemLabel);
      return;
    case "range":
      setNumber(semantics, "range", value, itemLabel);
      return;
    case "hitchance":
      setNumber(semantics, "hitChance", value, itemLabel);
      return;
    case "maxhitchance":
      setNumber(semantics, "maxHitChance", value, itemLabel);
      return;
    case "imbuementslot":
      setNumber(semantics, "imbuementSlots", value, itemLabel);
      return;
    case "decayto":
      setNumber(semantics, "decayTo", value, itemLabel);
      return;
    case "duration":
      setNumber(semantics, "duration", value, itemLabel);
      return;
    case "transformequipto":
      setNumber(semantics, "transformEquipTo", value, itemLabel);
      return;
    case "transformdeequipto":
      setNumber(semantics, "transformDeEquipTo", value, itemLabel);
      return;
    case "rotateto":
      setNumber(semantics, "rotateTo", value, itemLabel);
      return;
    case "writeable":
      semantics.writeable = boolean(value, `${itemLabel} writeable`);
      return;
    case "readable":
      semantics.readable = boolean(value, `${itemLabel} readable`);
      return;
    case "allowdistread":
      semantics.allowDistanceRead = boolean(
        value,
        `${itemLabel} allowdistread`,
      );
      return;
    case "maxtextlen":
      setNumber(semantics, "maxTextLength", value, itemLabel);
      return;
    case "leveldoor":
      setNumber(semantics, "levelDoor", value, itemLabel);
      return;
    case "bedpart":
      semantics.bedPart = value;
      return;
    case "fluidsource":
      semantics.fluidSource = value;
      return;
    case "elementdeath":
    case "elementearth":
    case "elementenergy":
    case "elementfire":
    case "elementice": {
      const damageType = key.slice("element".length);
      semantics.elementDamage ??= {};
      semantics.elementDamage[damageType] = integer(
        value,
        `${itemLabel} ${key}`,
      );
      return;
    }
    case "absorbpercentdeath":
    case "absorbpercentdrown":
    case "absorbpercentearth":
    case "absorbpercentenergy":
    case "absorbpercentfire":
    case "absorbpercentholy":
    case "absorbpercentice":
    case "absorbpercentlifedrain":
    case "absorbpercentmanadrain":
    case "absorbpercentphysical":
    case "absorbpercentpoison":
      setAbsorbPercent(
        semantics,
        key.slice("absorbpercent".length),
        value,
        itemLabel,
      );
      return;
    case "skillaxe":
    case "skillclub":
    case "skilldist":
    case "skillfist":
    case "skillshield":
    case "skillsword":
      setSkillModifier(
        semantics,
        key.slice("skill".length),
        value,
        itemLabel,
      );
      return;
    case "magiclevelpoints":
      setNumber(semantics, "magicLevelPoints", value, itemLabel);
      return;
    case "speed":
      setNumber(semantics, "speed", value, itemLabel);
      return;
    case "criticalhitchance":
      setNumber(semantics, "criticalHitChance", value, itemLabel);
      return;
    case "criticalhitdamage":
      setNumber(semantics, "criticalHitDamage", value, itemLabel);
      return;
    case "lifeleechamount":
      setNumber(semantics, "lifeLeechAmount", value, itemLabel);
      return;
    case "lifeleechchance":
      setNumber(semantics, "lifeLeechChance", value, itemLabel);
      return;
    case "manaleechamount":
      setNumber(semantics, "manaLeechAmount", value, itemLabel);
      return;
    case "manaleechchance":
      setNumber(semantics, "manaLeechChance", value, itemLabel);
      return;
    case "healthgain":
      setNumber(semantics, "healthGain", value, itemLabel);
      return;
    case "healthticks":
      setNumber(semantics, "healthTicks", value, itemLabel);
      return;
    case "managain":
      setNumber(semantics, "manaGain", value, itemLabel);
      return;
    case "manaticks":
      setNumber(semantics, "manaTicks", value, itemLabel);
      return;
  }
}

function applyScriptAttribute(semantics, attributes, itemLabel) {
  const key = attributes.get("key")?.toLowerCase();
  const rawValue = attributes.get("value");
  if (!key || rawValue === undefined) return;
  const value = rawValue.toLowerCase();
  if (key === "slot") {
    semantics.equipmentSlot = value;
    return;
  }
  if (key === "level") {
    semantics.requiredLevel = integer(value, `${itemLabel} required level`);
    return;
  }
  if (key === "vocation") {
    semantics.vocations = rawValue
      .split(",")
      .map((entry) => entry.split(";")[0]?.trim())
      .filter(Boolean);
    return;
  }
  if (key === "mana") {
    semantics.manaCost = integer(value, `${itemLabel} mana cost`);
    return;
  }
  if (key === "fromdamage") {
    semantics.minimumDamage = integer(value, `${itemLabel} minimum damage`);
    return;
  }
  if (key === "todamage") {
    semantics.maximumDamage = integer(value, `${itemLabel} maximum damage`);
    return;
  }
  if (key === "wandtype") {
    semantics.wandType = value;
    return;
  }
  if (key === "breakchance") {
    semantics.breakChance = integer(value, `${itemLabel} break chance`);
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
        semantics: {
          ...(name ? { name } : {}),
          ...(attributes.get("article")
            ? { article: attributes.get("article") }
            : {}),
          ...(attributes.get("plural")
            ? { plural: attributes.get("plural") }
            : {}),
        },
        attributeKeys: [],
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
      current.attributeKeys.pop();
      continue;
    }
    const attributes = tagAttributes(token);
    if (attributeDepth === 0) {
      applyAttribute(
        current.semantics,
        attributes,
        `item ${current.ids[0]}`,
      );
    } else if (current.attributeKeys[0] === "script") {
      applyScriptAttribute(
        current.semantics,
        attributes,
        `item ${current.ids[0]}`,
      );
    }
    if (!/\/>$/.test(token)) {
      current.attributeKeys.push(attributes.get("key")?.toLowerCase());
      attributeDepth += 1;
    }
  }
  if (current) throw new Error("unterminated item definition");
  return Object.fromEntries([...items.entries()].sort((a, b) => a[0] - b[0]));
}
