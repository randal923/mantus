const STRING_ATTRIBUTES = new Map([
  [1, "description"],
  [2, "externalFile"],
  [6, "text"],
  [7, "specialDescription"],
  [11, "monsterSpawnFile"],
  [13, "houseFile"],
  [19, "writtenBy"],
  [23, "npcSpawnFile"],
  [24, "zoneFile"],
]);

const U8_ATTRIBUTES = new Map([
  [12, "runeCharges"],
  [14, "houseDoorId"],
  [15, "count"],
  [17, "decayingState"],
]);

const U16_ATTRIBUTES = new Map([
  [4, "actionId"],
  [5, "uniqueId"],
  [9, "itemId"],
  [10, "depotId"],
  [22, "charges"],
]);

const U32_ATTRIBUTES = new Map([
  [3, "tileFlags"],
  [16, "duration"],
  [18, "writtenDate"],
  [20, "sleeperGuid"],
  [21, "sleepStart"],
]);

function requireBytes(bytes, offset, count, attribute) {
  if (offset + count > bytes.length) {
    throw new Error(`OTBM attribute ${attribute} is truncated`);
  }
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

export function decodeOtbmAttributes(bytes) {
  const attributes = {};
  let offset = 0;
  while (offset < bytes.length) {
    const attribute = bytes[offset++];
    if (attribute === 8) {
      requireBytes(bytes, offset, 5, attribute);
      attributes.teleportDestination = {
        x: readU16(bytes, offset),
        y: readU16(bytes, offset + 2),
        z: bytes[offset + 4],
      };
      offset += 5;
      continue;
    }
    const stringKey = STRING_ATTRIBUTES.get(attribute);
    if (stringKey) {
      requireBytes(bytes, offset, 2, attribute);
      const length = readU16(bytes, offset);
      offset += 2;
      requireBytes(bytes, offset, length, attribute);
      attributes[stringKey] = Buffer.from(
        bytes.subarray(offset, offset + length),
      ).toString("utf8");
      offset += length;
      continue;
    }
    const u8Key = U8_ATTRIBUTES.get(attribute);
    if (u8Key) {
      requireBytes(bytes, offset, 1, attribute);
      attributes[u8Key] = bytes[offset++];
      continue;
    }
    const u16Key = U16_ATTRIBUTES.get(attribute);
    if (u16Key) {
      requireBytes(bytes, offset, 2, attribute);
      attributes[u16Key] = readU16(bytes, offset);
      offset += 2;
      continue;
    }
    const u32Key = U32_ATTRIBUTES.get(attribute);
    if (u32Key) {
      requireBytes(bytes, offset, 4, attribute);
      attributes[u32Key] = readU32(bytes, offset);
      offset += 4;
      continue;
    }
    throw new Error(`unknown OTBM attribute ${attribute}`);
  }
  return attributes;
}
