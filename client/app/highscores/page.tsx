import type { Metadata } from "next";
import { HighscoresPage } from "../../components/public-site/HighscoresPage";

export const metadata: Metadata = {
  title: "Highscores | Mantus Online",
  description: "Browse the public Mantus Online character rankings.",
};

export default function Page() {
  return <HighscoresPage />;
}
