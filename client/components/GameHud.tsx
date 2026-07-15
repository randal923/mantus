export function GameHud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-tibia text-ui-text select-none">
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
