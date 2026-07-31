import type { Metadata } from "next";
import { ServerInfoPage } from "../../components/public-site/ServerInfoPage";

export const metadata: Metadata = {
  title: "Server Information | Mantus Online",
  description: "Review Mantus Online rates, systems, capacity, and world rules.",
};

export default function Page() {
  return <ServerInfoPage />;
}
