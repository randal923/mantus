import type { ButtonHTMLAttributes } from "react";

type PlaqueVariant = "steel" | "gold" | "red";

interface TibiaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PlaqueVariant;
}

/** Outer metal frame edge of the plaque. */
const FRAME_CLASS: Record<PlaqueVariant, string> = {
  steel: "bg-linear-to-b from-[#d8dee4] via-[#8b959f] to-[#4b545d]",
  gold: "bg-linear-to-b from-[#efdda6] via-[#c3a05a] to-[#775a24]",
  red: "bg-linear-to-b from-[#f08795] via-[#c04257] to-[#6d1322]",
};

/** Inner face of the plaque; gradient flips while pressed. */
const FILL_CLASS: Record<PlaqueVariant, string> = {
  steel:
    "bg-linear-to-b from-[#bcc5ce] via-[#77828d] via-45% to-[#37404a] group-active:bg-linear-to-t",
  gold: "bg-linear-to-b from-[#e8ca82] via-[#bd974a] via-45% to-[#6b4d1e] group-active:bg-linear-to-t",
  red: "bg-linear-to-b from-[#dd5b6d] via-[#a52737] via-45% to-[#520f1b] group-active:bg-linear-to-t",
};

/** Banner-plaque button: metal frame, textured face, chamfered plaque shape. */
export function TibiaButton({ variant = "steel", className, children, ...props }: TibiaButtonProps) {
  return (
    <button
      className={`group relative isolate px-6 py-1.5 font-display text-sm tracking-wider text-[#f2f5f7] [font-variant:small-caps] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-50 ${className ?? ""}`}
      {...props}
    >
      <span aria-hidden className={`clip-plaque absolute inset-0 -z-20 ${FRAME_CLASS[variant]}`} />
      <span aria-hidden className={`clip-plaque absolute inset-[2px] -z-10 ${FILL_CLASS[variant]}`} />
      <span
        aria-hidden
        className="clip-plaque texture-noise absolute inset-[2px] -z-10 opacity-40 mix-blend-overlay"
      />
      {children}
    </button>
  );
}
