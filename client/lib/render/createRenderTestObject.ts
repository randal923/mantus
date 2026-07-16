import type { TibiaFlags, TibiaObject } from "./AssetStore";

type TestObjectOverrides = Omit<Partial<TibiaObject>, "flags"> & {
  flags?: Partial<TibiaFlags>;
};

/** Creates a complete synthetic appearance for focused renderer fixtures. */
export function createRenderTestObject(
  overrides: TestObjectOverrides = {},
): TibiaObject {
  const flags: TibiaFlags = {
    ground: false,
    groundSpeed: 0,
    groundBorder: false,
    fullGround: false,
    notWalkable: false,
    blockProjectile: false,
    notMoveable: false,
    notPathable: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    dontHide: false,
    displacementX: 0,
    displacementY: 0,
    elevation: 0,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
    lightIntensity: 0,
    lightColor: 0,
    ...overrides.flags,
  };
  return {
    category: "item",
    clientId: 100,
    width: 1,
    height: 1,
    layers: 1,
    px: 1,
    py: 1,
    pz: 1,
    phases: 1,
    animation: null,
    sprites: [1],
    ...overrides,
    flags,
  };
}
