"use client";

import { publicCharacterProfileDataSchema } from "@tibia/protocol";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ButtonLink } from "../ui/ButtonLink";
import { PublicProfileAccountInformation } from "./PublicProfileAccountInformation";
import { PublicProfileAchievements } from "./PublicProfileAchievements";
import { PublicProfileCharactersPrivacy } from "./PublicProfileCharactersPrivacy";
import { PublicProfileDeaths } from "./PublicProfileDeaths";
import { PublicProfileInformation } from "./PublicProfileInformation";
import { PublicProfileSummary } from "./PublicProfileSummary";
import { PublicSiteLayout } from "./PublicSiteLayout";

interface CharacterProfilePageProps {
  readonly name: string;
}

export function CharacterProfilePage({ name }: CharacterProfilePageProps) {
  const { t } = useAppTranslation();
  const profile = usePublicApiData(
    `/api/public/characters/${encodeURIComponent(name)}`,
    publicCharacterProfileDataSchema,
  );
  const data = profile.data;

  return (
    <PublicSiteLayout>
      {data && <PublicProfileSummary profile={data} />}

      <div>
        {profile.status === "loading" && (
          <section className="portal-box p-10 text-center text-sm text-ui-muted">
            {t("common.loading")}…
          </section>
        )}
        {profile.status === "unavailable" && (
          <section className="portal-box p-10 text-center text-sm text-ui-muted">
            {t("publicSite.unavailable")}
          </section>
        )}
        {profile.status === "not-found" && (
          <section className="portal-box flex flex-col items-center gap-5 p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-[#f2ece2]">
              {t("publicProfile.notFoundTitle")}
            </h2>
            <p className="max-w-lg text-sm leading-6 text-ui-muted">
              {t("publicProfile.notFoundDescription", { name })}
            </p>
            <ButtonLink href="/characters" variant="primary" className="portal-cta">
              {t("publicProfile.searchAgain")}
            </ButtonLink>
          </section>
        )}

        {data && (
          <div className="grid gap-6">
            <PublicProfileInformation profile={data} />
            <PublicProfileAchievements achievements={data.achievements} />
            <PublicProfileDeaths deaths={data.deathHistory} />
            <PublicProfileAccountInformation createdAt={data.createdAt} />
            <PublicProfileCharactersPrivacy />
          </div>
        )}
      </div>
    </PublicSiteLayout>
  );
}
