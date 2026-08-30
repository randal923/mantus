import Image from "next/image";

/** Fixed full-viewport hero artwork fading into the page background. */
export function PublicSiteArtworkHeader() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Image
        src="/images/landing/mantus-hero.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[58%_top]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.35)_0%,rgba(8,8,8,0.72)_44%,#090909_80%)]" />
    </div>
  );
}
