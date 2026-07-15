import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeOtbmAttributes } from "./decodeOtbmAttributes.mjs";

test("decodes gameplay item attributes without accepting unknown data", () => {
  const attributes = decodeOtbmAttributes(
    Buffer.from([
      4, 0x34, 0x12,
      5, 0x78, 0x56,
      6, 3, 0, 102, 111, 111,
      8, 0x02, 0x01, 0x04, 0x03, 7,
      10, 9, 0,
      14, 4,
      15, 100,
      22, 0xcd, 0xab,
    ]),
  );

  assert.deepEqual(attributes, {
    actionId: 0x1234,
    uniqueId: 0x5678,
    text: "foo",
    teleportDestination: { x: 0x0102, y: 0x0304, z: 7 },
    depotId: 9,
    houseDoorId: 4,
    count: 100,
    charges: 0xabcd,
  });
});

test("decodes tile flags and persisted text metadata", () => {
  const attributes = decodeOtbmAttributes(
    Buffer.from([
      3, 0x1d, 0, 0, 0,
      7, 4, 0, 116, 101, 115, 116,
      16, 0x10, 0, 0, 0,
      17, 1,
      18, 2, 0, 0, 0,
      19, 3, 0, 66, 111, 98,
      20, 3, 0, 0, 0,
      21, 4, 0, 0, 0,
    ]),
  );

  assert.deepEqual(attributes, {
    tileFlags: 0x1d,
    specialDescription: "test",
    duration: 16,
    decayingState: 1,
    writtenDate: 2,
    writtenBy: "Bob",
    sleeperGuid: 3,
    sleepStart: 4,
  });
});

test("rejects unknown and truncated attributes", () => {
  assert.throws(() => decodeOtbmAttributes(Buffer.from([99])), /unknown/);
  assert.throws(
    () => decodeOtbmAttributes(Buffer.from([8, 1, 2])),
    /truncated/,
  );
});
