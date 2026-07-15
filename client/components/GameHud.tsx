import type { ConnectionStatus } from "../lib/net/GameClient";

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connecting: "bg-ui-gold text-ui-gold",
  connected: "bg-ui-success text-ui-success",
  disconnected: "bg-ui-accent-light text-ui-accent-light",
};

interface GameHudProps {
  connectionStatus: ConnectionStatus;
}

export function GameHud({ connectionStatus }: GameHudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
      <div
        aria-live="polite"
        className="ui-panel-frame absolute top-4 right-4 flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest text-ui-muted"
      >
        <span
          aria-hidden
          className={`size-2 rounded-full border border-black/60 shadow-[0_0_8px_currentColor] ${STATUS_CLASS[connectionStatus]}`}
        />
        {connectionStatus}
      </div>

      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="ui-panel-frame px-5 py-3 text-center shadow-2xl">
          <p className="font-display text-xs tracking-[0.22em] text-ui-gold uppercase">
            Movement
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ui-muted">
            <kbd className="rounded-md border border-ui-stone/50 bg-black/35 px-2 py-1 text-ui-text shadow-inner">W</kbd>
            <kbd className="rounded-md border border-ui-stone/50 bg-black/35 px-2 py-1 text-ui-text shadow-inner">A</kbd>
            <kbd className="rounded-md border border-ui-stone/50 bg-black/35 px-2 py-1 text-ui-text shadow-inner">S</kbd>
            <kbd className="rounded-md border border-ui-stone/50 bg-black/35 px-2 py-1 text-ui-text shadow-inner">D</kbd>
            <span className="mx-1 text-ui-stone-light/60">or</span>
            <span>arrow keys</span>
          </div>
        </div>
        <p className="text-[10px] tracking-wider text-ui-muted/70 uppercase">
          Open another tab to see another player
        </p>
      </div>
    </div>
  );
}
