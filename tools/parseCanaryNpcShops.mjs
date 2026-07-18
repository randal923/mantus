const SHOP_ROW_PATTERN = /\{(?=[^{}]*\b(?:clientId|clientid)\s*=)[^{}]*\}/g;
const FIELD_PATTERN =
  /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(-?\d+)|([A-Za-z_][A-Za-z0-9_.]*))/g;

/** Parses pinned literal NPC shop rows without executing Canary Lua. */
export function parseCanaryNpcShops(definitions, itemTypes) {
  const shops = [];
  const definitionsReport = [];
  let declaredRows = 0;

  for (const definition of definitions) {
    const source = maskComments(definition.source);
    if (!/\bnpcConfig\.shop\s*=/.test(source)) continue;
    const aliases = localAliases(source);
    const currencyValue = assignmentValue(source, "npcConfig.currency", aliases);
    const currencyItemTypeId =
      typeof currencyValue === "number" ? currencyValue : undefined;
    const currencyType = currencyItemTypeId
      ? itemTypes[String(currencyItemTypeId)]
      : undefined;
    const rows = [...source.matchAll(SHOP_ROW_PATTERN)];
    declaredRows += rows.length;
    const entries = [];
    const unsupportedRows = [];
    const offerIds = new Map();

    for (const rowMatch of rows) {
      const fields = rowFields(rowMatch[0], aliases);
      const itemTypeId = fields.clientid;
      const buyPrice = fields.buy ?? (fields.sell === undefined ? 0 : undefined);
      const sellPrice = fields.sell;
      if (
        typeof itemTypeId !== "number" ||
        (typeof buyPrice !== "number" && typeof sellPrice !== "number")
      ) {
        unsupportedRows.push({
          line: lineAt(source, rowMatch.index ?? 0),
          reason: "non-literal item id or price",
        });
        continue;
      }
      const itemType = itemTypes[String(itemTypeId)];
      if (!itemType) {
        unsupportedRows.push({
          line: lineAt(source, rowMatch.index ?? 0),
          itemTypeId,
          reason: "item is missing from the pinned item catalog",
        });
        continue;
      }
      const rawSubtype = fields.subtype ?? fields.count;
      const subtype =
        typeof rawSubtype === "number" &&
        (typeof itemType.charges === "number" || itemType.render?.fluidContainer)
          ? rawSubtype
          : undefined;
      const storageKey = storageKeyValue(fields.storagekey);
      const storageValue = fields.storagevalue;
      if (
        (storageKey === undefined) !== (storageValue === undefined) ||
        (storageValue !== undefined && typeof storageValue !== "number")
      ) {
        unsupportedRows.push({
          line: lineAt(source, rowMatch.index ?? 0),
          itemTypeId,
          reason: "incomplete or non-literal storage requirement",
        });
        continue;
      }
      const baseOfferId = `item-${itemTypeId}${
        subtype === undefined ? "" : `-${subtype}`
      }`;
      const occurrence = (offerIds.get(baseOfferId) ?? 0) + 1;
      offerIds.set(baseOfferId, occurrence);
      entries.push({
        offerId:
          occurrence === 1 ? baseOfferId : `${baseOfferId}-${occurrence}`,
        itemTypeId,
        name:
          stringValue(fields.itemname) ??
          stringValue(fields.name) ??
          itemType.name,
        minimumAmount: 1,
        maximumAmount: 100,
        ...(subtype === undefined ? {} : { subtype }),
        ...(typeof fields.stock === "number" ? { stock: fields.stock } : {}),
        ...(storageKey === undefined
          ? {}
          : {
              availability: [
                {
                  kind: "storage-at-least",
                  key: storageKey,
                  value: storageValue,
                },
              ],
            }),
        ...(typeof buyPrice === "number" ? { buyPrice } : {}),
        ...(typeof sellPrice === "number" ? { sellPrice } : {}),
      });
    }

    entries.sort(
      (left, right) =>
        left.itemTypeId - right.itemTypeId ||
        (left.subtype ?? 0) - (right.subtype ?? 0) ||
        left.name.localeCompare(right.name) ||
        left.offerId.localeCompare(right.offerId),
    );
    const callbacks = shopCallbacks(source);
    definitionsReport.push({
      typeId: definition.typeId,
      sourcePath: definition.path,
      declaredRows: rows.length,
      importedOffers: entries.length,
      unsupportedRows,
      callbacks: callbacks.classifications,
      unsupportedCallbacks: callbacks.unsupported,
      ...(entries.length === 0 && unsupportedRows.length === 0
        ? { classification: "empty-shop" }
        : {}),
    });
    if (entries.length === 0) continue;
    if (currencyItemTypeId && !currencyType) {
      throw new Error(
        `${definition.path} uses unknown currency item ${currencyItemTypeId}`,
      );
    }
    shops.push({
      id: definition.typeId,
      npcTypeId: definition.typeId,
      ...(currencyItemTypeId === undefined
        ? {}
        : {
            currencyItemTypeId,
            currencyName: currencyType.name,
          }),
      entries,
      excluded: unsupportedRows,
    });
  }

  return {
    shops,
    report: {
      sourceDefinitions: definitionsReport.length,
      catalogs: shops.length,
      declaredRows,
      importedOffers: shops.reduce(
        (total, shop) => total + shop.entries.length,
        0,
      ),
      unsupportedRows: definitionsReport.reduce(
        (total, definition) => total + definition.unsupportedRows.length,
        0,
      ),
      unsupportedCallbacks: definitionsReport.reduce(
        (total, definition) => total + definition.unsupportedCallbacks.length,
        0,
      ),
      emptyShops: definitionsReport.filter(
        (definition) => definition.classification === "empty-shop",
      ).length,
      definitions: definitionsReport,
    },
  };
}

function shopCallbacks(source) {
  const buy = callbackBody(source, "onBuyItem");
  const sell = callbackBody(source, "onSellItem");
  const classifications = {
    buy: buy && /\bnpc:sellItem\s*\(/.test(buy)
      ? "standard-item-grant"
      : buy
        ? "unsupported"
        : "project-transactional-default",
    sell: sell && /\bplayer:sendTextMessage\s*\([\s\S]*?Sold %ix %s for %i gold\./.test(sell)
      ? "standard-sale-confirmation"
      : sell
        ? "unsupported"
        : "project-transactional-default",
  };
  const unsupported = [];
  if (classifications.buy === "unsupported") {
    unsupported.push("onBuyItem");
  }
  if (classifications.sell === "unsupported") {
    unsupported.push("onSellItem");
  }
  return { classifications, unsupported };
}

function callbackBody(source, name) {
  const match = source.match(
    new RegExp(`^npcType\\.${name}\\s*=\\s*function\\([^\\n]*\\)\\n([\\s\\S]*?)^end\\s*$`, "m"),
  );
  return match?.[1];
}

function maskComments(source) {
  let masked = "";
  let index = 0;
  while (index < source.length) {
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      const end = stringEnd(source, index, quote);
      masked += source.slice(index, end);
      index = end;
      continue;
    }
    if (source.startsWith("--[[", index)) {
      const end = source.indexOf("]]", index + 4);
      const stop = end === -1 ? source.length : end + 2;
      masked += source
        .slice(index, stop)
        .replace(/[^\n]/g, " ");
      index = stop;
      continue;
    }
    if (source.startsWith("--", index)) {
      const end = source.indexOf("\n", index + 2);
      const stop = end === -1 ? source.length : end;
      masked += " ".repeat(stop - index);
      index = stop;
      continue;
    }
    masked += source[index];
    index++;
  }
  return masked;
}

function stringEnd(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    index++;
    if (source[index - 1] === quote) return index;
  }
  return source.length;
}

function localAliases(source) {
  const aliases = new Map();
  for (const match of source.matchAll(
    /^local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\r\n]+)/gm,
  )) {
    const raw = match[2].trim().replace(/[;,]\s*$/, "");
    const value = scalarValue(raw, aliases);
    if (value !== undefined) aliases.set(match[1], value);
  }
  return aliases;
}

function assignmentValue(source, name, aliases) {
  const escaped = name.replaceAll(".", "\\.");
  const match = source.match(
    new RegExp(`^${escaped}\\s*=\\s*([^\\r\\n]+)`, "m"),
  );
  return match ? scalarValue(match[1].trim(), aliases) : undefined;
}

function rowFields(row, aliases) {
  const fields = {};
  for (const match of row.matchAll(FIELD_PATTERN)) {
    const key = match[1].toLowerCase();
    if (match[2] !== undefined || match[3] !== undefined) {
      fields[key] = decodeString(match[2] ?? match[3]);
      continue;
    }
    if (match[4] !== undefined) {
      fields[key] = Number(match[4]);
      continue;
    }
    fields[key] = scalarValue(match[5], aliases);
  }
  return fields;
}

function scalarValue(raw, aliases) {
  const value = raw.trim();
  if (/^-?\d+$/.test(value)) return Number(value);
  const string = value.match(/^"((?:\\.|[^"\\])*)"$/) ??
    value.match(/^'((?:\\.|[^'\\])*)'$/);
  if (string) return decodeString(string[1]);
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)) {
    return aliases.get(value) ?? { identifier: value };
  }
  return undefined;
}

function decodeString(value) {
  return value.replace(/\\(n|r|t|\\|"|')/g, (_match, escaped) => {
    const replacements = { n: "\n", r: "\r", t: "\t" };
    return replacements[escaped] ?? escaped;
  });
}

function storageKeyValue(value) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value && typeof value.identifier === "string") return value.identifier;
  return undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}
