// Wheel of Destiny — render/hit-test geometry and art paths for the 522x522 wheel.
//
// Every value in this file is transcribed from the mehah/otclient game_wheel
// module (modules/game_wheel/): wheelMenu.otui (widget layout), buttons.lua
// (per-node slice/ring/art tables), geometry.lua (hit-test math), icons.lua
// (per-vocation sprite-sheet clips) and wheelclass.lua (runtime opacities and
// image swaps). Source lines are cited next to non-obvious values.
//
// This module is purely descriptive: geometry + art paths (+ maxPoints, which
// the fill-step art depends on). Node adjacency, costs and perk effects live
// elsewhere.
//
// All image paths point at client/public/assets/wheel/ (see ASSETS.md).

export type WheelQuadrant = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export type WheelVocation = 'knight' | 'paladin' | 'sorcerer' | 'druid' | 'monk';

export interface WheelPoint {
  x: number;
  y: number;
}

/** Pixel rect inside a sprite sheet (image-clip in otui terms). */
export interface WheelClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WheelNodeGeometry {
  quadrant: WheelQuadrant;
  /** 1 = innermost ring (roots) .. 5 = outermost. */
  ring: 1 | 2 | 3 | 4 | 5;
  /** Slice sector index for hit testing, see angle convention below (buttons.lua). */
  slice: number;
  /** Number of equal sectors the node's ring circle is divided into (4, 8 or 12). */
  totalSlices: number;
  /** Outer radius of the node's ring in px (buttons.lua:1-5). */
  outerRadius: number;
  /** Points needed to complete the node (bonus.lua WheelBonus[id-1].maxPoints). */
  maxPoints: number;
  /** Number of partial-fill overlay images for this node (files 1..fillSteps). */
  fillSteps: number;
  /** Directory of the 522x522 fill overlays: `${fillImageDir}/${step}.png`. */
  fillImageDir: string;
  /** 522x522 selection border overlay (borderSelectedWheel, wheelclass.lua:308). */
  borderImage: string;
  /** 522x522 hover focus overlay (focusSelectedWheel, wheelclass.lua:470). */
  focusImage: string;
  /** Center of the node's 30x30 medium-perk icon inside the 522 canvas. */
  iconCenter: WheelPoint;
}

export const WHEEL_CANVAS_SIZE = 522;

/**
 * Canvas center used for hit testing. Note: wheelclass.lua:87-89 reads the
 * top-left of a 2x2 `centerReferencePoint` widget centered in the 522 panel,
 * which is (260, 260); the true image center is (261, 261). The 1px bias is
 * an original-client artifact — use (261, 261) for rendering.
 */
export const WHEEL_CENTER: WheelPoint = { x: 261, y: 261 };

/**
 * Outer radii of rings 1..5 (buttons.lua:1-5: SMALL=53, MEDIUM=106,
 * BIG_MEDIUM=160, LARGE=215, BIG_LARGE=261).
 */
export const WHEEL_RING_RADII = [53, 106, 160, 215, 261] as const;

/** Base wheel frame drawn under everything (wheelMenu.otui:1182). */
export const WHEEL_BACKDROP_IMAGE = '/assets/wheel/backdrop_skillwheel.png';

/**
 * Per-vocation 522x522 backdrop drawn over the color overlays and under the
 * icons (wheelMenu.otui:2042-2046, swapped at wheelclass.lua:742-766). The
 * vocation art has the quadrant symbols baked in; the per-node perk icons are
 * NOT baked in — they come from the icon widgets below.
 */
export const VOCATION_BACKDROP_IMAGES: Record<WheelVocation, string> = {
  knight: '/assets/wheel/wheel-vocations/backdrop_skillwheel_knight.png',
  paladin: '/assets/wheel/wheel-vocations/backdrop_skillwheel_paladin.png',
  sorcerer: '/assets/wheel/wheel-vocations/backdrop_skillwheel_sorcerer.png',
  druid: '/assets/wheel/wheel-vocations/backdrop_skillwheel_druid.png',
  monk: '/assets/wheel/wheel-vocations/backdrop_skillwheel_monk.png',
};

/*
 * ── Hit-test angle convention (geometry.lua:32-46 Circle:isPointInSlice) ──
 *
 * dx = px - cx, dy = py - cy in SCREEN coordinates (y grows downward).
 * angle = atan2(dy, dx), normalized into [0, 2*PI) by adding 2*PI when
 * negative. Therefore angle 0 points at +x (3 o'clock) and the angle
 * increases toward +y, i.e. CLOCKWISE on screen.
 *
 * A node with sector `slice` of `totalSlices` covers the angular interval
 *   [slice * 2*PI/totalSlices, (slice + 1) * 2*PI/totalSlices]
 * (geometry.lua:33-35; both interval tests are inclusive), combined with
 * dx*dx + dy*dy <= outerRadius^2.
 *
 * Sanity check: node 22 (bottom-right root) is slice 0 of 4 = [0deg, 90deg]
 * = east..south clockwise = the bottom-right quadrant.
 *
 * Ring membership (wheelclass.lua:116-145): a node only matches if the point
 * is inside its outerRadius AND OUTSIDE every smaller ring radius — i.e. the
 * point's distance r must satisfy innerRadius < r <= outerRadius where
 * innerRadius is WHEEL_RING_RADII[ring - 2] (0 for ring 1).
 *
 * The original code also preselects the candidate quadrant by the sign of
 * dx/dy (wheelclass.lua:92-108) and walks WHEEL_QUADRANT_NODES in order.
 */

/**
 * Node ids per quadrant in the original hit-test iteration order, outermost
 * ring first (buttons.lua:334-339 WheelSettings).
 */
export const WHEEL_QUADRANT_NODES: Record<WheelQuadrant, readonly number[]> = {
  topLeft: [1, 2, 7, 3, 8, 13, 9, 14, 15],
  topRight: [6, 5, 12, 4, 11, 18, 10, 17, 16],
  bottomLeft: [31, 25, 32, 33, 26, 19, 27, 20, 21],
  bottomRight: [36, 35, 30, 34, 29, 24, 28, 23, 22],
};

/*
 * ── Per-node geometry ──
 *
 * quadrant/slot dir/border/focus/slice/totalSlices/radius transcribed from
 * buttons.lua WheelButtons[1..36]; icon centers converted from the
 * `icon<N>` widgets in wheelMenu.otui:2048-3011 (anchors.centerIn parent
 * with margins; otclient resolves centerIn margins as
 * offset = (marginLeft - marginRight, marginTop - marginBottom) from the
 * parent center — src/framework/ui/uianchorlayout.cpp:269,323 — so
 * iconCenter = 261 + that offset on each axis).
 *
 * Fill overlays: `${fillImageDir}/${step}.png` where step is 1..fillSteps
 * (see getFillStep below). fillSteps per ring: 5/8/10/15/20
 * (wheelclass.lua:480-492 and the fullColorWheel_* sources in
 * wheelMenu.otui, e.g. slot9/20 at line 1336).
 *
 * NOTE the border overlay file number is NOT always the slot number
 * (transcribed verbatim from buttons.lua): nodes 4, 18, 23, 24, 28, 30, 34
 * and 35 use a different wheel-border file than their wheel-colors slot dir.
 * The focus overlay file names carry the original art's "Botton" typo for
 * the bottom quadrants (e.g. BottonLeft_4.png).
 */
export const WHEEL_NODES: Record<number, WheelNodeGeometry> = {
  1: {
    quadrant: 'topLeft',
    ring: 5,
    slice: 2,
    totalSlices: 4,
    outerRadius: 261,
    maxPoints: 200,
    fillSteps: 20,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot9',
    borderImage: '/assets/wheel/wheel-border/top_left/9.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_9.png',
    iconCenter: { x: 95, y: 95 },
  },
  2: {
    quadrant: 'topLeft',
    ring: 4,
    slice: 5,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot8',
    borderImage: '/assets/wheel/wheel-border/top_left/8.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_8.png',
    iconCenter: { x: 169, y: 102 },
  },
  3: {
    quadrant: 'topLeft',
    ring: 3,
    slice: 8,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot6',
    borderImage: '/assets/wheel/wheel-border/top_left/6.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_6.png',
    iconCenter: { x: 226, y: 134 },
  },
  4: {
    quadrant: 'topRight',
    ring: 3,
    slice: 9,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot4',
    borderImage: '/assets/wheel/wheel-border/top_right/6.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_4.png',
    iconCenter: { x: 296, y: 134 },
  },
  5: {
    quadrant: 'topRight',
    ring: 4,
    slice: 6,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot8',
    borderImage: '/assets/wheel/wheel-border/top_right/8.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_8.png',
    iconCenter: { x: 353, y: 102 },
  },
  6: {
    quadrant: 'topRight',
    ring: 5,
    slice: 3,
    totalSlices: 4,
    outerRadius: 261,
    maxPoints: 200,
    fillSteps: 20,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot9',
    borderImage: '/assets/wheel/wheel-border/top_right/9.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_9.png',
    iconCenter: { x: 427, y: 95 },
  },
  7: {
    quadrant: 'topLeft',
    ring: 4,
    slice: 4,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot7',
    borderImage: '/assets/wheel/wheel-border/top_left/7.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_7.png',
    iconCenter: { x: 102, y: 169 },
  },
  8: {
    quadrant: 'topLeft',
    ring: 3,
    slice: 7,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot5',
    borderImage: '/assets/wheel/wheel-border/top_left/5.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_5.png',
    iconCenter: { x: 168, y: 168 },
  },
  9: {
    quadrant: 'topLeft',
    ring: 2,
    slice: 5,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot3',
    borderImage: '/assets/wheel/wheel-border/top_left/3.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_3.png',
    iconCenter: { x: 229, y: 190 },
  },
  10: {
    quadrant: 'topRight',
    ring: 2,
    slice: 6,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot3',
    borderImage: '/assets/wheel/wheel-border/top_right/3.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_3.png',
    iconCenter: { x: 293, y: 190 },
  },
  11: {
    quadrant: 'topRight',
    ring: 3,
    slice: 10,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot5',
    borderImage: '/assets/wheel/wheel-border/top_right/5.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_5.png',
    iconCenter: { x: 354, y: 168 },
  },
  12: {
    quadrant: 'topRight',
    ring: 4,
    slice: 7,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot7',
    borderImage: '/assets/wheel/wheel-border/top_right/7.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_7.png',
    iconCenter: { x: 420, y: 169 },
  },
  13: {
    quadrant: 'topLeft',
    ring: 3,
    slice: 6,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot4',
    borderImage: '/assets/wheel/wheel-border/top_left/4.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_4.png',
    iconCenter: { x: 134, y: 226 },
  },
  14: {
    quadrant: 'topLeft',
    ring: 2,
    slice: 4,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot2',
    borderImage: '/assets/wheel/wheel-border/top_left/2.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_2.png',
    iconCenter: { x: 189, y: 231 },
  },
  15: {
    quadrant: 'topLeft',
    ring: 1,
    slice: 2,
    totalSlices: 4,
    outerRadius: 53,
    maxPoints: 50,
    fillSteps: 5,
    fillImageDir: '/assets/wheel/wheel-colors/top_left/slot1',
    borderImage: '/assets/wheel/wheel-border/top_left/1.png',
    focusImage: '/assets/wheel/wheel-colors/top_left/TopLeft_1.png',
    iconCenter: { x: 241, y: 241 },
  },
  16: {
    quadrant: 'topRight',
    ring: 1,
    slice: 3,
    totalSlices: 4,
    outerRadius: 53,
    maxPoints: 50,
    fillSteps: 5,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot1',
    borderImage: '/assets/wheel/wheel-border/top_right/1.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_1.png',
    iconCenter: { x: 281, y: 241 },
  },
  17: {
    quadrant: 'topRight',
    ring: 2,
    slice: 7,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot2',
    borderImage: '/assets/wheel/wheel-border/top_right/2.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_2.png',
    iconCenter: { x: 333, y: 231 },
  },
  18: {
    quadrant: 'topRight',
    ring: 3,
    slice: 11,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/top_right/slot6',
    borderImage: '/assets/wheel/wheel-border/top_right/4.png',
    focusImage: '/assets/wheel/wheel-colors/top_right/TopRight_6.png',
    iconCenter: { x: 388, y: 226 },
  },
  19: {
    quadrant: 'bottomLeft',
    ring: 3,
    slice: 5,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot4',
    borderImage: '/assets/wheel/wheel-border/bottom_left/4.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_4.png',
    iconCenter: { x: 134, y: 296 },
  },
  20: {
    quadrant: 'bottomLeft',
    ring: 2,
    slice: 3,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot2',
    borderImage: '/assets/wheel/wheel-border/bottom_left/2.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_2.png',
    iconCenter: { x: 189, y: 291 },
  },
  21: {
    quadrant: 'bottomLeft',
    ring: 1,
    slice: 1,
    totalSlices: 4,
    outerRadius: 53,
    maxPoints: 50,
    fillSteps: 5,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot1',
    borderImage: '/assets/wheel/wheel-border/bottom_left/1.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_1.png',
    iconCenter: { x: 241, y: 281 },
  },
  22: {
    quadrant: 'bottomRight',
    ring: 1,
    slice: 0,
    totalSlices: 4,
    outerRadius: 53,
    maxPoints: 50,
    fillSteps: 5,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot1',
    borderImage: '/assets/wheel/wheel-border/bottom_right/1.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_1.png',
    iconCenter: { x: 281, y: 281 },
  },
  23: {
    quadrant: 'bottomRight',
    ring: 2,
    slice: 0,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot3',
    borderImage: '/assets/wheel/wheel-border/bottom_right/2.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_3.png',
    iconCenter: { x: 333, y: 291 },
  },
  24: {
    quadrant: 'bottomRight',
    ring: 3,
    slice: 0,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot6',
    borderImage: '/assets/wheel/wheel-border/bottom_right/4.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_6.png',
    iconCenter: { x: 388, y: 296 },
  },
  25: {
    quadrant: 'bottomLeft',
    ring: 4,
    slice: 3,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot7',
    borderImage: '/assets/wheel/wheel-border/bottom_left/7.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_7.png',
    iconCenter: { x: 103, y: 353 },
  },
  26: {
    quadrant: 'bottomLeft',
    ring: 3,
    slice: 4,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot5',
    borderImage: '/assets/wheel/wheel-border/bottom_left/5.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_5.png',
    iconCenter: { x: 168, y: 354 },
  },
  27: {
    quadrant: 'bottomLeft',
    ring: 2,
    slice: 2,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot3',
    borderImage: '/assets/wheel/wheel-border/bottom_left/3.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_3.png',
    iconCenter: { x: 230, y: 334 },
  },
  28: {
    quadrant: 'bottomRight',
    ring: 2,
    slice: 1,
    totalSlices: 8,
    outerRadius: 106,
    maxPoints: 75,
    fillSteps: 8,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot2',
    borderImage: '/assets/wheel/wheel-border/bottom_right/3.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_2.png',
    iconCenter: { x: 292, y: 334 },
  },
  29: {
    quadrant: 'bottomRight',
    ring: 3,
    slice: 1,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot5',
    borderImage: '/assets/wheel/wheel-border/bottom_right/5.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_5.png',
    iconCenter: { x: 354, y: 354 },
  },
  30: {
    quadrant: 'bottomRight',
    ring: 4,
    slice: 0,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot8',
    borderImage: '/assets/wheel/wheel-border/bottom_right/7.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_8.png',
    iconCenter: { x: 419, y: 353 },
  },
  31: {
    quadrant: 'bottomLeft',
    ring: 5,
    slice: 1,
    totalSlices: 4,
    outerRadius: 261,
    maxPoints: 200,
    fillSteps: 20,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot9',
    borderImage: '/assets/wheel/wheel-border/bottom_left/9.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_9.png',
    iconCenter: { x: 95, y: 427 },
  },
  32: {
    quadrant: 'bottomLeft',
    ring: 4,
    slice: 2,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot8',
    borderImage: '/assets/wheel/wheel-border/bottom_left/8.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_8.png',
    iconCenter: { x: 169, y: 419 },
  },
  33: {
    quadrant: 'bottomLeft',
    ring: 3,
    slice: 3,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_left/slot6',
    borderImage: '/assets/wheel/wheel-border/bottom_left/6.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_left/BottonLeft_6.png',
    iconCenter: { x: 226, y: 388 },
  },
  34: {
    quadrant: 'bottomRight',
    ring: 3,
    slice: 2,
    totalSlices: 12,
    outerRadius: 160,
    maxPoints: 100,
    fillSteps: 10,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot4',
    borderImage: '/assets/wheel/wheel-border/bottom_right/6.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_4.png',
    iconCenter: { x: 296, y: 388 },
  },
  35: {
    quadrant: 'bottomRight',
    ring: 4,
    slice: 1,
    totalSlices: 8,
    outerRadius: 215,
    maxPoints: 150,
    fillSteps: 15,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot7',
    borderImage: '/assets/wheel/wheel-border/bottom_right/8.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_7.png',
    iconCenter: { x: 353, y: 419 },
  },
  36: {
    quadrant: 'bottomRight',
    ring: 5,
    slice: 0,
    totalSlices: 4,
    outerRadius: 261,
    maxPoints: 200,
    fillSteps: 20,
    fillImageDir: '/assets/wheel/wheel-colors/bottom_right/slot9',
    borderImage: '/assets/wheel/wheel-border/bottom_right/9.png',
    focusImage: '/assets/wheel/wheel-colors/bottom_right/BottonRight_9.png',
    iconCenter: { x: 427, y: 427 },
  },
};

/*
 * ── Overlay opacities (runtime values, not the otui defaults) ──
 *
 * The otui declares opacity 0.4 on every colorWheel_/fullColorWheel_ panel
 * (wheelMenu.otui:1190 etc.), but wheelclass.lua overwrites them:
 */
/** colorWheel_<id> partial/complete fill while points > 0 (wheelclass.lua:494,537). */
export const FILL_OPACITY = 0.6;
/** fullColorWheel_<id> "can be unlocked" hint slice (wheelclass.lua:253,477). */
export const UNLOCK_HINT_OPACITY = 0.2;
/** focusSelectedWheel hover overlay, set on every mouse-move hit (wheelclass.lua:469). */
export const HOVER_FOCUS_OPACITY = 0.3;
/** borderSelectedWheel selection overlay keeps full opacity (never changed by lua). */
export const SELECTION_BORDER_OPACITY = 1;
/**
 * The four root nodes' fullColorWheel hints (ids 15, 16, 21, 22) are always
 * visible once the wheel opens (wheelclass.lua:859-862).
 */
export const ROOT_NODE_IDS = [15, 16, 21, 22] as const;

/* ── Node icons ── */

/** icon<N> widgets are 30x30 clips from ICON_SHEETS.mediumPerks (wheelMenu.otui:2049-2056). */
export const NODE_ICON_SIZE = 30;
/** smallicon<N> widgets are 16x16 clips from ICON_SHEETS.smallPerks (wheelMenu.otui:2058-2066). */
export const SMALL_ICON_SIZE = 16;
/**
 * Every smallicon<N> is centerIn its icon<N> with margin-right 10 /
 * margin-top 10, i.e. its center sits at iconCenter + (-10, +10) — the
 * bottom-left corner of the 30x30 icon (wheelMenu.otui:2059-2065; identical
 * for all 36 nodes).
 */
export const SMALL_ICON_OFFSET: WheelPoint = { x: -10, y: 10 };
/**
 * modIcon<N> (gem-vessel resonance badge, only on VESSEL_NODES) is declared
 * 16x16 with center at iconCenter + (-8, -8) (wheelMenu.otui:2078-2087;
 * margin-right 8, margin-top -8). The source PNGs are actually 10x10.
 */
export const MOD_ICON_OFFSET: WheelPoint = { x: -8, y: -8 };
export const MOD_ICON_SIZE = 16;

/** Sprite sheets the wheel icons clip from (sheet pixel sizes in comments). */
export const ICON_SHEETS = {
  /** 1470x30 — 30x30 medium perk icons (icon1..36). */
  mediumPerks: '/assets/wheel/icons-skillwheel-mediumperks.png',
  /** 208x16 — 16x16 mini icons (smallicon1..36). */
  smallPerks: '/assets/wheel/icons-skillwheel-smallperks.png',
  /** 544x34 — 34x34 corner revelation-perk icons (perkIcon* widgets). */
  largePerks: '/assets/wheel/icons-skillwheel-largeperks.png',
  /** 850x34 — 34x34 gem-socket states (gemSocket0..3, wheelclass.lua:3335-3337). */
  sockets: '/assets/wheel/icons-skillwheel-sockets.png',
  /** 10x10 badge shown on basic-mod vessels (modIcon widgets). */
  vesselResonanceBasic: '/assets/wheel/icon-skillwheel-vesselresonance-basic.png',
  /** 10x10 badge shown on supreme-mod vessels (modIcon widgets). */
  vesselResonanceSupreme: '/assets/wheel/icon-skillwheel-vesselresonance-supreme.png',
  /** 26x28 — copied for completeness; not referenced by the otclient wheel module. */
  selection: '/assets/wheel/icon-skillwheel-selection.png',
} as const;

/**
 * Nodes whose conviction perk is a gem vessel, and which resonance badge
 * their modIcon uses (wheelMenu.otui modIcon<N> image-sources; matches
 * icons.lua VesselIndex, 0-based there). 3 vessels per quadrant.
 */
export const VESSEL_NODES: Record<number, 'basic' | 'supreme'> = {
  3: 'basic',
  5: 'supreme',
  7: 'supreme',
  10: 'basic',
  15: 'basic',
  18: 'basic',
  19: 'basic',
  22: 'basic',
  27: 'basic',
  30: 'supreme',
  32: 'supreme',
  34: 'basic',
};

/* ── Corner medallions (revelation perks) ── */

export interface WheelCornerLayer {
  image: string;
  /** Top-left position inside the 522 canvas. */
  pos: WheelPoint;
  size: { w: number; h: number };
}

export interface WheelCornerGeometry {
  /** 0=TL, 1=TR, 2=BL, 3=BR — the suffix used by socket art and lua loops. */
  socketIndex: 0 | 1 | 2 | 3;
  /** Draw order bottom → top: socket bg, revelation bg, progress ring, light, front, marker. */
  socketDisabled: WheelCornerLayer;
  socketEnabled: WheelCornerLayer;
  /** Colored disc behind the progress ring (wheel-colors/<quad>/perkCircle/). */
  revelationBg: WheelCornerLayer;
  /**
   * UIProgressRect: a 46x46 square outline traced clockwise as percent
   * grows, filled with `progressColor` (wheelMenu.otui:1850-1860 etc.).
   */
  progressRect: WheelClipRect;
  progressColor: string;
  backdropLight: WheelCornerLayer;
  /**
   * Stage art: frontImages[i] is backdrop_skillwheel_largebonus_front<i>_*;
   * stage from the quadrant's total points (wheelclass.lua:2085-2097):
   * <250 → 0 (percent p/250), <500 → 1 (percent (p-250)/250),
   * <1000 → 2 (percent (p-500)/500), else 3 (percent 100).
   */
  frontImages: readonly [string, string, string, string];
  /** marker_largeperk 48x48 selection marker (selectPassive<N>, hidden by default). */
  marker: WheelCornerLayer;
  /** 34x34 clickable revelation-perk icon, clipped from ICON_SHEETS.largePerks. */
  perkIconPos: WheelPoint;
  /**
   * Per-vocation clip into largePerks (wheelclass.lua:743-770). The topLeft
   * clip is x=0 for every vocation (shared damage/healing icon).
   */
  perkIconClips: Record<WheelVocation, WheelClipRect>;
}

/** Quadrant point totals at which the corner art advances a stage (wheelclass.lua:2085-2097). */
export const REVELATION_STAGE_THRESHOLDS = [250, 500, 1000] as const;

/*
 * Corner widget positions: the socket/light images are 118x85 and the
 * revelationBg/front images are 178x178; all are anchored flush into their
 * corner of the 522 panel with no margins (wheelMenu.otui:1837-2039), so
 * positions below are (522 - imageSize) on the far axes. The progress rect
 * is inset 18px and the marker 17px from its corner.
 */
export const WHEEL_CORNERS: Record<WheelQuadrant, WheelCornerGeometry> = {
  topLeft: {
    socketIndex: 0,
    socketDisabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketdisabled_0.png',
      pos: { x: 0, y: 0 },
      size: { w: 118, h: 85 },
    },
    socketEnabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketenabled_0.png',
      pos: { x: 0, y: 0 },
      size: { w: 118, h: 85 },
    },
    revelationBg: {
      image: '/assets/wheel/wheel-colors/top_left/perkCircle/revelationBg.png',
      pos: { x: 0, y: 0 },
      size: { w: 178, h: 178 },
    },
    progressRect: { x: 18, y: 18, w: 46, h: 46 },
    progressColor: '#4a5e14',
    backdropLight: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_light_TL.png',
      pos: { x: 0, y: 0 },
      size: { w: 118, h: 85 },
    },
    frontImages: [
      '/assets/wheel/backdrop_skillwheel_largebonus_front0_TL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front1_TL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front2_TL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front3_TL.png',
    ],
    marker: {
      image: '/assets/wheel/marker_largeperk.png',
      pos: { x: 17, y: 17 },
      size: { w: 48, h: 48 },
    },
    perkIconPos: { x: 24, y: 24 },
    perkIconClips: {
      knight: { x: 0, y: 0, w: 34, h: 34 },
      paladin: { x: 0, y: 0, w: 34, h: 34 },
      sorcerer: { x: 0, y: 0, w: 34, h: 34 },
      druid: { x: 0, y: 0, w: 34, h: 34 },
      monk: { x: 0, y: 0, w: 34, h: 34 },
    },
  },
  topRight: {
    socketIndex: 1,
    socketDisabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketdisabled_1.png',
      pos: { x: 404, y: 0 },
      size: { w: 118, h: 85 },
    },
    socketEnabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketenabled_1.png',
      pos: { x: 404, y: 0 },
      size: { w: 118, h: 85 },
    },
    revelationBg: {
      image: '/assets/wheel/wheel-colors/top_right/perkCircle/revelationBg.png',
      pos: { x: 344, y: 0 },
      size: { w: 178, h: 178 },
    },
    progressRect: { x: 458, y: 18, w: 46, h: 46 },
    progressColor: '#701723',
    backdropLight: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_light_TR.png',
      pos: { x: 404, y: 0 },
      size: { w: 118, h: 85 },
    },
    frontImages: [
      '/assets/wheel/backdrop_skillwheel_largebonus_front0_TR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front1_TR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front2_TR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front3_TR.png',
    ],
    marker: {
      image: '/assets/wheel/marker_largeperk.png',
      pos: { x: 457, y: 17 },
      size: { w: 48, h: 48 },
    },
    perkIconPos: { x: 464, y: 24 },
    perkIconClips: {
      knight: { x: 34, y: 0, w: 34, h: 34 },
      paladin: { x: 136, y: 0, w: 34, h: 34 },
      sorcerer: { x: 238, y: 0, w: 34, h: 34 },
      druid: { x: 374, y: 0, w: 34, h: 34 },
      monk: { x: 442, y: 0, w: 34, h: 34 },
    },
  },
  bottomLeft: {
    socketIndex: 2,
    socketDisabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketdisabled_2.png',
      pos: { x: 0, y: 437 },
      size: { w: 118, h: 85 },
    },
    socketEnabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketenabled_2.png',
      pos: { x: 0, y: 437 },
      size: { w: 118, h: 85 },
    },
    revelationBg: {
      image: '/assets/wheel/wheel-colors/bottom_left/perkCircle/revelationBg.png',
      pos: { x: 0, y: 344 },
      size: { w: 178, h: 178 },
    },
    progressRect: { x: 18, y: 458, w: 46, h: 46 },
    progressColor: '#166248',
    backdropLight: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_light_BL.png',
      pos: { x: 0, y: 437 },
      size: { w: 118, h: 85 },
    },
    frontImages: [
      '/assets/wheel/backdrop_skillwheel_largebonus_front0_BL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front1_BL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front2_BL.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front3_BL.png',
    ],
    marker: {
      image: '/assets/wheel/marker_largeperk.png',
      pos: { x: 17, y: 457 },
      size: { w: 48, h: 48 },
    },
    perkIconPos: { x: 24, y: 464 },
    perkIconClips: {
      knight: { x: 68, y: 0, w: 34, h: 34 },
      paladin: { x: 170, y: 0, w: 34, h: 34 },
      sorcerer: { x: 272, y: 0, w: 34, h: 34 },
      druid: { x: 340, y: 0, w: 34, h: 34 },
      monk: { x: 476, y: 0, w: 34, h: 34 },
    },
  },
  bottomRight: {
    socketIndex: 3,
    socketDisabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketdisabled_3.png',
      pos: { x: 404, y: 437 },
      size: { w: 118, h: 85 },
    },
    socketEnabled: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_socketenabled_3.png',
      pos: { x: 404, y: 437 },
      size: { w: 118, h: 85 },
    },
    revelationBg: {
      image: '/assets/wheel/wheel-colors/bottom_right/perkCircle/revelationBg.png',
      pos: { x: 344, y: 344 },
      size: { w: 178, h: 178 },
    },
    progressRect: { x: 458, y: 458, w: 46, h: 46 },
    progressColor: '#6d1667',
    backdropLight: {
      image: '/assets/wheel/backdrop_skillwheel_largebonus_light_BR.png',
      pos: { x: 404, y: 437 },
      size: { w: 118, h: 85 },
    },
    frontImages: [
      '/assets/wheel/backdrop_skillwheel_largebonus_front0_BR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front1_BR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front2_BR.png',
      '/assets/wheel/backdrop_skillwheel_largebonus_front3_BR.png',
    ],
    marker: {
      image: '/assets/wheel/marker_largeperk.png',
      pos: { x: 457, y: 457 },
      size: { w: 48, h: 48 },
    },
    perkIconPos: { x: 464, y: 464 },
    perkIconClips: {
      knight: { x: 102, y: 0, w: 34, h: 34 },
      paladin: { x: 204, y: 0, w: 34, h: 34 },
      sorcerer: { x: 306, y: 0, w: 34, h: 34 },
      druid: { x: 408, y: 0, w: 34, h: 34 },
      monk: { x: 510, y: 0, w: 34, h: 34 },
    },
  },
};

/* ── Gem vessel sockets on the wheel rim ── */

export interface WheelGemSocketGeometry {
  /** 0=TL, 1=TR, 2=BL, 3=BR (onGemVesselClick argument / widget suffix). */
  socketIndex: 0 | 1 | 2 | 3;
  /** Center of the 34x34 gemSocket<N> / 36x36 selectVessel<N> widgets. */
  center: WheelPoint;
  /** Default socket clip into ICON_SHEETS.sockets (wheelMenu.otui:2574 etc.). */
  socketClip: WheelClipRect;
}

/**
 * gemSocket0..3 / selectVessel0..3 positions from wheelMenu.otui (centerIn
 * margins, e.g. gemSocket1 at lines 2570-2579: margin-left 160 /
 * margin-bottom 239 → center (421, 22)). The runtime swaps the clip by
 * gem/vessel state (wheelclass.lua:3316-3358); only the default is recorded
 * here. The 36x36 marker_skillwheelsocket.png highlight and 32x32 gem icon
 * are centered on the same point.
 */
export const WHEEL_GEM_SOCKETS: readonly WheelGemSocketGeometry[] = [
  { socketIndex: 0, center: { x: 101, y: 22 }, socketClip: { x: 34, y: 0, w: 34, h: 34 } },
  { socketIndex: 1, center: { x: 421, y: 22 }, socketClip: { x: 34, y: 0, w: 34, h: 34 } },
  { socketIndex: 2, center: { x: 101, y: 500 }, socketClip: { x: 34, y: 0, w: 34, h: 34 } },
  { socketIndex: 3, center: { x: 421, y: 500 }, socketClip: { x: 34, y: 0, w: 34, h: 34 } },
];

/** Marker drawn by selectVessel<N> when a vessel node is selected. */
export const VESSEL_MARKER_IMAGE = '/assets/wheel/marker_skillwheelsocket.png';

/*
 * ── Per-vocation icon clips ──
 *
 * Transcribed from icons.lua WheelIcons[vocation][nodeId]: `icon` is the
 * image-clip into ICON_SHEETS.mediumPerks (30x30), `miniIcon` into
 * ICON_SHEETS.smallPerks (16x16). The otui icon widgets render these for
 * ALL 36 nodes (set at wheelclass.lua:795-841 onCreate); nothing is baked
 * into the vocation backdrops.
 */
export interface WheelNodeIconClips {
  icon: WheelClipRect;
  miniIcon: WheelClipRect;
}

export const VOCATION_ICON_CLIPS: Record<WheelVocation, Record<number, WheelNodeIconClips>> = {
  knight: {
    1: { icon: { x: 240, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    2: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    3: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    4: { icon: { x: 210, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    5: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    6: { icon: { x: 360, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    7: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    8: { icon: { x: 390, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    9: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    10: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    11: { icon: { x: 420, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    12: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    13: { icon: { x: 330, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    14: { icon: { x: 210, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    15: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    16: { icon: { x: 300, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    17: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    18: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    19: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    20: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    21: { icon: { x: 360, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    22: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    23: { icon: { x: 210, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    24: { icon: { x: 390, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    25: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    26: { icon: { x: 420, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    27: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    28: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    29: { icon: { x: 330, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    30: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    31: { icon: { x: 300, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    32: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    33: { icon: { x: 210, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    34: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    35: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    36: { icon: { x: 270, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
  },
  paladin: {
    1: { icon: { x: 510, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    2: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    3: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    4: { icon: { x: 450, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    5: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    6: { icon: { x: 660, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    7: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    8: { icon: { x: 630, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    9: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    10: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    11: { icon: { x: 600, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    12: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    13: { icon: { x: 570, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    14: { icon: { x: 450, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    15: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    16: { icon: { x: 540, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    17: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    18: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    19: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    20: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    21: { icon: { x: 660, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    22: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    23: { icon: { x: 450, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    24: { icon: { x: 630, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    25: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    26: { icon: { x: 600, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    27: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    28: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    29: { icon: { x: 570, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    30: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    31: { icon: { x: 540, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    32: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    33: { icon: { x: 450, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    34: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    35: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    36: { icon: { x: 480, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
  },
  sorcerer: {
    1: { icon: { x: 1050, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    2: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    3: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    4: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    5: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    6: { icon: { x: 810, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    7: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    8: { icon: { x: 1080, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    9: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    10: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    11: { icon: { x: 780, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    12: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    13: { icon: { x: 750, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    14: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    15: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    16: { icon: { x: 720, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    17: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    18: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    19: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    20: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    21: { icon: { x: 810, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    22: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    23: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    24: { icon: { x: 1080, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    25: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    26: { icon: { x: 780, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    27: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    28: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    29: { icon: { x: 750, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    30: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    31: { icon: { x: 720, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    32: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    33: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    34: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    35: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    36: { icon: { x: 810, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
  },
  druid: {
    1: { icon: { x: 840, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    2: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    3: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    4: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    5: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    6: { icon: { x: 930, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    7: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    8: { icon: { x: 960, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    9: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    10: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    11: { icon: { x: 990, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    12: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    13: { icon: { x: 900, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    14: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    15: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    16: { icon: { x: 870, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    17: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    18: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    19: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    20: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    21: { icon: { x: 930, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    22: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    23: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    24: { icon: { x: 960, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    25: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    26: { icon: { x: 990, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    27: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    28: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    29: { icon: { x: 900, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    30: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    31: { icon: { x: 870, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    32: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    33: { icon: { x: 1020, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    34: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    35: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    36: { icon: { x: 1050, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
  },
  monk: {
    1: { icon: { x: 1260, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    2: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    3: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    4: { icon: { x: 1290, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    5: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    6: { icon: { x: 1410, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    7: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    8: { icon: { x: 1350, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    9: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    10: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    11: { icon: { x: 1380, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    12: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    13: { icon: { x: 1440, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    14: { icon: { x: 1290, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    15: { icon: { x: 1110, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    16: { icon: { x: 1320, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    17: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    18: { icon: { x: 1140, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    19: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    20: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    21: { icon: { x: 1410, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    22: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    23: { icon: { x: 1290, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    24: { icon: { x: 1350, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    25: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    26: { icon: { x: 1380, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    27: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 0, y: 0, w: 16, h: 16 } },
    28: { icon: { x: 150, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    29: { icon: { x: 1440, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    30: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    31: { icon: { x: 1320, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
    32: { icon: { x: 1170, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    33: { icon: { x: 1290, y: 0, w: 30, h: 30 }, miniIcon: { x: 64, y: 0, w: 16, h: 16 } },
    34: { icon: { x: 1200, y: 0, w: 30, h: 30 }, miniIcon: { x: 48, y: 0, w: 16, h: 16 } },
    35: { icon: { x: 180, y: 0, w: 30, h: 30 }, miniIcon: { x: 16, y: 0, w: 16, h: 16 } },
    36: { icon: { x: 1230, y: 0, w: 30, h: 30 }, miniIcon: { x: 32, y: 0, w: 16, h: 16 } },
  },
};

/**
 * Which fill overlay image (1..fillSteps) to draw for a node, i.e.
 * `${fillImageDir}/${getFillStep(points, node)}.png`, at FILL_OPACITY.
 * Returns 0 when nothing should be drawn.
 *
 * From wheelclass.lua insertPoint (473-539): a completed node uses the
 * ring's max step (480-493); a partially filled node uses
 * floor(points / 10) + 1 (534), which never exceeds fillSteps because
 * maxPoints is a multiple of 10 with fillSteps * 10 >= maxPoints - 10 + 10.
 */
export function getFillStep(points: number, node: WheelNodeGeometry): number {
  if (points <= 0) {
    return 0;
  }
  if (points >= node.maxPoints) {
    return node.fillSteps;
  }
  return Math.min(Math.floor(points / 10) + 1, node.fillSteps);
}
