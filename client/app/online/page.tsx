import type { Metadata } from "next";
import { OnlinePlayersPage } from "../../components/public-site/OnlinePlayersPage";

export const metadata: Metadata = {
  title: "Who Is Online | Mantus Online",
  description: "See the characters currently connected to Mantus Online.",
};

export default function Page() {
  return <OnlinePlayersPage />;
}
