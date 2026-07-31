import type { Metadata } from "next";
import { CharacterSearchPage } from "../../components/public-site/CharacterSearchPage";

export const metadata: Metadata = {
  title: "Character Lookup | Mantus Online",
  description: "Look up a public Mantus Online character profile.",
};

export default function Page() {
  return <CharacterSearchPage />;
}
