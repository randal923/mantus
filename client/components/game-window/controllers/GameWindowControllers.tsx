import { GameWindowView } from "../GameWindowView";
import { GameWindowConnectionController } from "./GameWindowConnectionController";
import { GameWindowHotkeyController } from "./GameWindowHotkeyController";
import { GameWindowSessionController } from "./GameWindowSessionController";

export function GameWindowControllers() {
  return (
    <>
      <GameWindowSessionController />
      <GameWindowConnectionController />
      <GameWindowHotkeyController />
      <GameWindowView />
    </>
  );
}
