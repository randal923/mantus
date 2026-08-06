import type { Metadata } from "next";
import { GuildsPage } from "../../components/public-site/GuildsPage";

export const metadata: Metadata = {
  title: "Guilds | Mantus Online",
  description:
    "The guilds of the Mantus world with their full member rosters and ranks.",
};

export default function Page() {
  return <GuildsPage />;
}
