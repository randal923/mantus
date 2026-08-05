import type { Metadata } from "next";
import { ItemsWikiPage } from "../../../components/public-site/ItemsWikiPage";

export const metadata: Metadata = {
  title: "Items Wiki | Mantus Online",
  description:
    "Item rarity grades and the affix pool of Mantus Online — how Uncommon, Rare, Epic and Legendary drops roll their bonuses.",
};

export default function Page() {
  return <ItemsWikiPage />;
}
