import { MAP_DEPTH } from "./mapDepth";

interface TileObjectFlags {
  ground: boolean;
  groundBorder: boolean;
  onBottom: boolean;
  onTop: boolean;
}

/** Returns one tile's objects in Tibia stack-priority draw order. */
export function getOrderedTileObjects<
  TileObject extends { flags: TileObjectFlags },
>(objects: readonly TileObject[]) {
  const grounds = objects.filter((object) => object.flags.ground);
  const borders = objects.filter(
    (object) => !object.flags.ground && object.flags.groundBorder,
  );
  const bottoms = objects.filter(
    (object) =>
      !object.flags.ground &&
      !object.flags.groundBorder &&
      object.flags.onBottom,
  );
  const common = objects.filter(
    (object) =>
      !object.flags.ground &&
      !object.flags.groundBorder &&
      !object.flags.onBottom &&
      !object.flags.onTop,
  );
  const onTop = objects.filter(
    (object) =>
      !object.flags.ground &&
      !object.flags.groundBorder &&
      !object.flags.onBottom &&
      object.flags.onTop,
  );

  return [
    ...grounds.map((object, stack) => ({ object, ground: true, stack })),
    ...borders.map((object, stack) => ({
      object,
      ground: false,
      stack: MAP_DEPTH.groundBorder + stack,
    })),
    ...bottoms.map((object, stack) => ({
      object,
      ground: false,
      stack: MAP_DEPTH.bottom + stack,
    })),
    ...common.reverse().map((object, stack) => ({
      object,
      ground: false,
      stack: MAP_DEPTH.item + stack,
    })),
    ...onTop.map((object, stack) => ({
      object,
      ground: false,
      stack: MAP_DEPTH.onTop + stack,
    })),
  ];
}
