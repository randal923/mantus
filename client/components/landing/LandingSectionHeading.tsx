interface LandingSectionHeadingProps {
  title: string;
  subtitle: string;
}

export function LandingSectionHeading({
  title,
  subtitle,
}: LandingSectionHeadingProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 className="font-display text-xl font-bold tracking-widest text-ui-text-bright uppercase sm:text-2xl">
        {title}
      </h2>
      <div aria-hidden className="ui-divider w-40" />
      <p className="max-w-xl text-sm leading-relaxed text-ui-muted">{subtitle}</p>
    </div>
  );
}
