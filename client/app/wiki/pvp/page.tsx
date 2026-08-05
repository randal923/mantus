import type { Metadata } from "next";
import { PvpWikiPage } from "../../../components/public-site/PvpWikiPage";

export const metadata: Metadata = {
  title: "PvP Wiki | Mantus Online",
  description:
    "PvP in Mantus Online: no halved player-versus-player damage, real 1v1 duels, and high levels that actually matter.",
};

export default function Page() {
  return <PvpWikiPage />;
}
