interface LandingNewsRowProps {
  tag: string;
  date: string;
  title: string;
  excerpt: string;
}

export function LandingNewsRow({
  tag,
  date,
  title,
  excerpt,
}: LandingNewsRowProps) {
  return (
    <article className="overflow-hidden border border-ui-stone-light/20 bg-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-accent/35 bg-[linear-gradient(90deg,rgba(91,16,12,0.88),rgba(55,10,8,0.62))] px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <time className="shrink-0 text-xs font-medium text-ui-text">
            {date}
          </time>
          <span aria-hidden className="text-ui-muted">
            —
          </span>
          <h3 className="font-display text-sm font-bold leading-6 tracking-wide text-ui-text-bright uppercase">
            {title}
          </h3>
        </div>
        <span className="w-fit border border-ui-accent-light/30 bg-black/25 px-2 py-0.5 font-display text-xs font-bold tracking-wider text-ui-accent-light uppercase">
          {tag}
        </span>
      </header>
      <p className="px-5 py-4 text-sm leading-6 text-ui-text">{excerpt}</p>
    </article>
  );
}
