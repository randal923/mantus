import Image from "next/image";

export function PublicSiteArtworkHeader() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-16 z-0 isolate h-[42rem] overflow-hidden"
    >
      <Image
        src="/images/landing/mantus-citadel-hero.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="landing-hero-fade -z-20 object-cover object-[58%_center]"
      />
      <div className="landing-hero-fade absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,4,4,0.9)_0%,rgba(3,4,4,0.5)_42%,rgba(3,4,4,0.14)_72%,rgba(3,4,4,0.46)_100%)]" />
    </div>
  );
}
