/**
 * Persistent skull carried on the character row and on the online Player.
 * Viewer-relative marks (yellow/orange) are never persisted — they are
 * projected per recipient at send time.
 */
export type SkullState = "none" | "white" | "red" | "black";
