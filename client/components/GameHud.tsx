import { SpellBar } from "./spells/SpellBar";

const PLACEHOLDER_SPELLS = [
  { id: "light-healing", name: "Light Healing", glyph: "✚", shortcut: "1", manaCost: 20 },
  { id: "energy-strike", name: "Energy Strike", glyph: "ϟ", shortcut: "2", manaCost: 35 },
  { id: "ice-wave", name: "Ice Wave", glyph: "❄", shortcut: "3", manaCost: 55 },
  {
    id: "fire-bomb",
    name: "Fire Bomb",
    glyph: "✦",
    shortcut: "4",
    manaCost: 85,
    cooldownRemaining: 3,
    cooldownTotal: 6,
  },
  { id: "haste", name: "Haste", glyph: "»", shortcut: "5", manaCost: 60 },
  { id: "magic-shield", name: "Magic Shield", glyph: "◇", shortcut: "6", manaCost: 50 },
  { id: "ultimate-healing", name: "Ultimate Healing", glyph: "✥", shortcut: "7", manaCost: 160 },
  { id: "empty-slot", name: "Empty Slot", glyph: "", shortcut: "8", disabled: true },
] as const;

interface GameHudProps {
  spellHotkeysEnabled?: boolean;
}

export function GameHud({ spellHotkeysEnabled = true }: GameHudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <SpellBar
          spells={PLACEHOLDER_SPELLS}
          hotkeysEnabled={spellHotkeysEnabled}
          onCast={() => undefined}
        />
        <p className="text-[10px] tracking-wider text-ui-muted/70 uppercase">
          WASD to move · I for inventory · Esc for menu
        </p>
      </div>
    </div>
  );
}
