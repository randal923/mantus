import type { Position } from "@tibia/protocol";

export interface WorldItemSourceContent {
  readonly typeId: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly contents: ReadonlyArray<WorldItemSourceContent>;
}

export interface WorldItemSourceData {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly contents: ReadonlyArray<WorldItemSourceContent>;
}

export interface WorldItemSource {
  readonly seedKey: string;
  readonly mapName: string;
  readonly mapVersion: string;
  readonly typeId: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly position: Position;
  readonly stackIndex: number;
  readonly contents: ReadonlyArray<WorldItemSourceContent>;
}
