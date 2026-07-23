export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "sm" | "md";

export const BUTTON_BASE_CLASS =
  "ui-button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-button font-normal tracking-wide uppercase outline-none transition-[color,border-color,box-shadow,transform,filter] duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ui-panel-deep disabled:pointer-events-none disabled:opacity-40 disabled:hover:translate-y-0";

export const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "ui-button-primary border-ui-accent-light/55 text-ui-text-bright hover:border-ui-accent-light hover:brightness-110",
  secondary:
    "ui-button-secondary border-ui-stone-light/25 text-ui-text hover:border-ui-gold/55 hover:text-ui-text-bright hover:brightness-110",
  danger:
    "ui-button-danger border-ui-accent/55 text-ui-accent-light hover:border-ui-accent-light/80 hover:text-ui-text-bright hover:brightness-110",
};

export const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-5 text-sm",
};
