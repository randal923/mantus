import { MAP_DEPTH } from "./mapDepth";

const ITEM_DEPTH_STRIDE = 4;
const MAX_ELEVATION = 24;

interface RenderFlags {
  ground: boolean;
  groundBorder: boolean;
  onBottom: boolean;
  onTop: boolean;
  elevation: number;
}

export interface TileRenderItem<RenderObject extends { flags: RenderFlags }> {
  instanceId: string;
  stackIndex: number;
  object: RenderObject;
}

export type TileRenderLayer =
  | "ground"
  | "ground-border"
  | "bottom-item"
  | "common-item"
  | "top-item";

export interface LayeredTileObject<RenderObject extends { flags: RenderFlags }>
  extends TileRenderItem<RenderObject> {
  layer: TileRenderLayer;
  depth: number;
  elevationBefore: number;
}

export interface TileRenderLayers<RenderObject extends { flags: RenderFlags }> {
  ground: LayeredTileObject<RenderObject>[];
  groundBorders: LayeredTileObject<RenderObject>[];
  bottomItems: LayeredTileObject<RenderObject>[];
  commonItems: LayeredTileObject<RenderObject>[];
  topItems: LayeredTileObject<RenderObject>[];
  beforeCreature: LayeredTileObject<RenderObject>[];
  creatureElevation: number;
}

/** Converts source stack positions into the client draw layers for one tile. */
export function getTileRenderLayers<
  RenderObject extends { flags: RenderFlags },
>(items: ReadonlyArray<TileRenderItem<RenderObject>>): TileRenderLayers<RenderObject> {
  const sourceOrder = [...items].sort(
    (left, right) => left.stackIndex - right.stackIndex,
  );
  const groups = {
    ground: sourceOrder.filter(({ object }) => object.flags.ground),
    groundBorders: sourceOrder.filter(
      ({ object }) => !object.flags.ground && object.flags.groundBorder,
    ),
    bottomItems: sourceOrder.filter(
      ({ object }) =>
        !object.flags.ground &&
        !object.flags.groundBorder &&
        object.flags.onBottom,
    ),
    commonItems: sourceOrder
      .filter(
        ({ object }) =>
          !object.flags.ground &&
          !object.flags.groundBorder &&
          !object.flags.onBottom &&
          !object.flags.onTop,
      )
      .reverse(),
    topItems: sourceOrder.filter(
      ({ object }) =>
        !object.flags.ground &&
        !object.flags.groundBorder &&
        !object.flags.onBottom &&
        object.flags.onTop,
    ),
  };

  let elevation = 0;
  const layer = <ItemObject extends RenderObject>(
    entries: ReadonlyArray<TileRenderItem<ItemObject>>,
    name: TileRenderLayer,
    baseDepth: number,
    applyElevation: boolean,
  ): LayeredTileObject<ItemObject>[] =>
    entries.map((entry, index) => {
      const layered = {
        ...entry,
        layer: name,
        depth: baseDepth + index * ITEM_DEPTH_STRIDE,
        elevationBefore: applyElevation ? elevation : 0,
      };
      if (applyElevation) {
        elevation = Math.min(
          MAX_ELEVATION,
          elevation + Math.max(0, entry.object.flags.elevation),
        );
      }
      return layered;
    });

  const ground = layer(groups.ground, "ground", MAP_DEPTH.ground, true);
  const groundBorders = layer(
    groups.groundBorders,
    "ground-border",
    MAP_DEPTH.groundBorder,
    true,
  );
  const bottomItems = layer(
    groups.bottomItems,
    "bottom-item",
    MAP_DEPTH.bottom,
    true,
  );
  const commonItems = layer(
    groups.commonItems,
    "common-item",
    MAP_DEPTH.item,
    true,
  );
  const creatureElevation = elevation;
  const topItems = layer(
    groups.topItems,
    "top-item",
    MAP_DEPTH.onTop,
    false,
  );

  return {
    ground,
    groundBorders,
    bottomItems,
    commonItems,
    topItems,
    beforeCreature: [
      ...ground,
      ...groundBorders,
      ...bottomItems,
      ...commonItems,
    ],
    creatureElevation,
  };
}
