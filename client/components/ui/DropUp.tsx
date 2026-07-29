"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface DropUpOption<Value extends string> {
  value: Value;
  label: string;
  /** Secondary line — spell words, mana cost, carried count. */
  description?: string;
  icon?: ReactNode;
  /** Heading the option is listed under. */
  group?: string;
}

interface DropUpProps<Value extends string> {
  ariaLabel: string;
  value: Value;
  options: ReadonlyArray<DropUpOption<Value>>;
  onChange: (value: Value) => void;
  /** Placeholder for the filter box. */
  searchLabel: string;
  /** Shown when the filter matches nothing. */
  emptyLabel: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

interface Placement {
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly maxHeight: number;
}

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_HEIGHT = 384;
const VIEWPORT_MARGIN = 8;

/**
 * A picker that opens *upwards* over its trigger with icons and a filter box.
 * It is positioned against the viewport so the panel is never clipped by the
 * scrolling panel or modal it lives in.
 */
export function DropUp<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  searchLabel,
  emptyLabel,
  label,
  disabled = false,
  className,
}: DropUpProps<Value>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const query = search.trim().toLocaleLowerCase();
  const visible = options.filter(
    (option) =>
      option.label.toLocaleLowerCase().includes(query) ||
      option.description?.toLocaleLowerCase().includes(query),
  );
  const groups = [...new Set(visible.map((option) => option.group ?? ""))];

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(
      Math.max(rect.width, PANEL_MIN_WIDTH),
      window.innerWidth - VIEWPORT_MARGIN * 2,
    );
    setPlacement({
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
      ),
      bottom: window.innerHeight - rect.top + 6,
      width,
      maxHeight: Math.max(160, Math.min(PANEL_MAX_HEIGHT, rect.top - 24)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const select = (next: Value) => {
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
    if (next !== value) onChange(next);
  };

  return (
    <div className={`flex min-w-0 flex-col gap-2 font-tibia ${className ?? ""}`}>
      {label && (
        <span className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={selected?.label}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          place();
          setSearch("");
          setOpen(true);
        }}
        className="ui-dropdown relative flex h-12 min-w-0 items-center gap-2 rounded-md border border-ui-stone-light/25 py-1 pr-8 pl-1.5 text-left font-tibia text-sm text-white outline-none transition-[border-color,box-shadow,filter] duration-150 hover:border-ui-gold/45 hover:brightness-110 focus-visible:border-ui-gold/60 focus-visible:ring-2 focus-visible:ring-ui-gold/15 disabled:pointer-events-none disabled:opacity-45"
      >
        {selected?.icon && (
          <span className="flex size-11 shrink-0 items-center justify-center">
            {selected.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? ""}
        </span>
        <span
          aria-hidden
          className="absolute right-3 font-display text-xs text-ui-accent-light"
        >
          ▲
        </span>
      </button>
      {open && placement && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            left: placement.left,
            bottom: placement.bottom,
            width: placement.width,
          }}
          className="ui-panel-frame fixed z-50 flex flex-col gap-2 p-2 shadow-xl shadow-black/60"
        >
          <input
            // The panel only appears from an explicit click and the filter is
            // its primary control, so it takes focus on open.
            autoFocus
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !visible[0]) return;
              event.preventDefault();
              select(visible[0].value);
            }}
            className="h-9 w-full shrink-0 rounded-md border border-ui-stone/50 bg-black/40 px-3 font-tibia text-sm text-ui-text outline-none placeholder:text-ui-muted/55 focus:border-ui-gold/60 focus:ring-2 focus:ring-ui-gold/15"
          />
          <div
            className="ui-scrollbar min-h-0 overflow-y-auto overscroll-contain pr-1"
            style={{ maxHeight: placement.maxHeight }}
          >
            {groups.map((group) => (
              <div key={group}>
                {group && (
                  <p className="px-1 pt-2 pb-1 font-display text-[0.65rem] font-bold tracking-widest text-ui-gold uppercase">
                    {group}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {visible
                    .filter((option) => (option.group ?? "") === group)
                    .map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.value === value}
                          onClick={() => select(option.value)}
                          className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                            option.value === value
                              ? "border-ui-gold/70 bg-ui-gold/10"
                              : "border-transparent hover:border-ui-gold/35 hover:bg-white/5"
                          }`}
                        >
                          {option.icon && (
                            <span className="flex size-11 shrink-0 items-center justify-center">
                              {option.icon}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ui-text-bright">
                              {option.label}
                            </span>
                            {option.description && (
                              <span className="block truncate text-xs text-ui-muted">
                                {option.description}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-ui-muted">
                {emptyLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
