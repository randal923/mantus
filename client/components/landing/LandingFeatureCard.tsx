interface LandingFeatureCardProps {
  title: string;
  description: string;
}

export function LandingFeatureCard({
  title,
  description,
}: LandingFeatureCardProps) {
  return (
    <article className="ui-panel-frame flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/25 bg-black/35 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]"
        >
          <span className="size-2 rotate-45 bg-ui-accent-light" />
        </span>
        <h3 className="font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
          {title}
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-ui-text">{description}</p>
    </article>
  );
}
