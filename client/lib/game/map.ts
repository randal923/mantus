// Hand-authored small city map built from Tibia client item ids.

export const TILE = 32;

// Ground
export const GRASS = 106;
export const GRASS_FLOWERS_A = 108;
export const GRASS_FLOWERS_B = 109;
export const PLAZA = 429; // gray stone slabs
export const SIDEWALK = 423; // sandstone floor
export const WOOD_FLOOR = 431; // framed stone interior floor
export const SAND = 231;

// Gray stone wall family
export const WALL_V = 1292; // runs north-south
export const WALL_H = 1295; // runs west-east
export const WALL_POLE = 1296;
export const WALL_CORNER = 1298; // NW corner piece

export const TREES = [25134, 25135, 25136, 25162, 25164, 25166];
export const BLOOD_SPLAT = 2696;

export interface MapTile {
  ground: number;
  items: number[];
}

export interface MonsterSpawn {
  name: string;
  outfit: number;
  x: number;
  y: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  stepMs: number;
  attackMs: number;
}

export interface CityMap {
  width: number;
  height: number;
  tiles: MapTile[][]; // [y][x]
  playerStart: { x: number; y: number };
  spawns: MonsterSpawn[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCity(): CityMap {
  const W = 46;
  const H = 38;
  const rnd = mulberry32(1337);

  const tiles: MapTile[][] = [];
  for (let y = 0; y < H; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < W; x++) {
      const r = rnd();
      const ground = r < 0.06 ? GRASS_FLOWERS_A : r < 0.12 ? GRASS_FLOWERS_B : GRASS;
      row.push({ ground, items: [] });
    }
    tiles.push(row);
  }

  const setGround = (x1: number, y1: number, x2: number, y2: number, id: number) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) tiles[y][x].ground = id;
  };
  const addItem = (x: number, y: number, id: number) => tiles[y][x].items.push(id);

  // City perimeter wall, with a 2-wide south gate and north gate on the main road.
  const wallRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gaps: Array<[number, number]>
  ) => {
    const isGap = (x: number, y: number) => gaps.some(([gx, gy]) => gx === x && gy === y);
    for (let x = x1 + 1; x < x2; x++) {
      if (!isGap(x, y1)) addItem(x, y1, WALL_H);
      if (!isGap(x, y2)) addItem(x, y2, WALL_H);
    }
    for (let y = y1 + 1; y < y2; y++) {
      if (!isGap(x1, y)) addItem(x1, y, WALL_V);
      if (!isGap(x2, y)) addItem(x2, y, WALL_V);
    }
    addItem(x1, y1, WALL_CORNER);
    addItem(x2, y1, WALL_POLE);
    addItem(x1, y2, WALL_POLE);
    addItem(x2, y2, WALL_POLE);
  };

  const GATE_X = 22;
  wallRect(4, 4, 41, 33, [
    [GATE_X, 33],
    [GATE_X + 1, 33],
    [GATE_X, 4],
    [GATE_X + 1, 4],
  ]);

  // Paved streets: main road north-south, cross road west-east, central plaza.
  setGround(GATE_X, 5, GATE_X + 1, 32, PLAZA);
  setGround(5, 18, 40, 19, PLAZA);
  setGround(17, 14, 28, 23, PLAZA);
  // Sidewalk border around the central plaza
  setGround(17, 14, 28, 14, SIDEWALK);
  setGround(17, 23, 28, 23, SIDEWALK);
  setGround(17, 14, 17, 23, SIDEWALK);
  setGround(28, 14, 28, 23, SIDEWALK);
  // Sand road leading out of the south + north gates
  setGround(GATE_X, 34, GATE_X + 1, H - 1, SAND);
  setGround(GATE_X, 0, GATE_X + 1, 3, SAND);

  // Houses: stone walls + wood floors, door gap in the wall facing the street.
  const house = (x1: number, y1: number, x2: number, y2: number, doors: Array<[number, number]>) => {
    setGround(x1, y1, x2, y2, WOOD_FLOOR);
    wallRect(x1, y1, x2, y2, doors);
  };
  house(7, 7, 15, 13, [[11, 13]]); // NW
  house(30, 7, 38, 13, [[34, 13]]); // NE
  house(7, 24, 15, 30, [[11, 24]]); // SW
  house(30, 24, 38, 30, [[34, 24]]); // SE

  // Trees: outside the walls and in the inner-yard parks (never on roads/houses).
  const isClear = (x: number, y: number) =>
    tiles[y][x].items.length === 0 && tiles[y][x].ground !== SAND;
  const treeAt = (x: number, y: number) => {
    if (isClear(x, y)) addItem(x, y, TREES[Math.floor(rnd() * TREES.length)]);
  };
  // outer ring
  for (let i = 0; i < 90; i++) {
    const x = 1 + Math.floor(rnd() * (W - 2));
    const y = 1 + Math.floor(rnd() * (H - 2));
    const outside = x < 3 || x > 42 || y < 3 || y > 34;
    if (outside) treeAt(x, y);
  }
  // inner parks (grassy corners of each quadrant)
  const parks: Array<[number, number, number, number]> = [
    [17, 7, 20, 11],
    [25, 7, 28, 11],
    [17, 26, 20, 31],
    [25, 26, 28, 31],
  ];
  for (const [x1, y1, x2, y2] of parks) {
    for (let i = 0; i < 3; i++) {
      const x = x1 + Math.floor(rnd() * (x2 - x1 + 1));
      const y = y1 + Math.floor(rnd() * (y2 - y1 + 1));
      if (tiles[y][x].ground === GRASS) treeAt(x, y);
    }
  }

  const spawns: MonsterSpawn[] = [
    { name: "Rat", outfit: 21, x: 9, y: 17, maxHp: 20, dmgMin: 1, dmgMax: 8, stepMs: 300, attackMs: 1800 },
    { name: "Rat", outfit: 21, x: 13, y: 21, maxHp: 20, dmgMin: 1, dmgMax: 8, stepMs: 300, attackMs: 1800 },
    { name: "Rat", outfit: 21, x: 33, y: 17, maxHp: 20, dmgMin: 1, dmgMax: 8, stepMs: 300, attackMs: 1800 },
    { name: "Rat", outfit: 21, x: 24, y: 30, maxHp: 20, dmgMin: 1, dmgMax: 8, stepMs: 300, attackMs: 1800 },
    { name: "Orc", outfit: 5, x: 18, y: 28, maxHp: 70, dmgMin: 4, dmgMax: 18, stepMs: 380, attackMs: 2000 },
    { name: "Orc", outfit: 5, x: 20, y: 26, maxHp: 70, dmgMin: 4, dmgMax: 18, stepMs: 380, attackMs: 2000 },
    { name: "Orc", outfit: 5, x: 26, y: 28, maxHp: 70, dmgMin: 4, dmgMax: 18, stepMs: 380, attackMs: 2000 },
    { name: "Cyclops", outfit: 22, x: 19, y: 9, maxHp: 260, dmgMin: 8, dmgMax: 40, stepMs: 450, attackMs: 2200 },
    { name: "Cyclops", outfit: 22, x: 27, y: 10, maxHp: 260, dmgMin: 8, dmgMax: 40, stepMs: 450, attackMs: 2200 },
    { name: "Demon", outfit: 35, x: 23, y: 1, maxHp: 700, dmgMin: 15, dmgMax: 70, stepMs: 400, attackMs: 2000 },
  ];

  return { width: W, height: H, tiles, playerStart: { x: GATE_X, y: 20 }, spawns };
}
