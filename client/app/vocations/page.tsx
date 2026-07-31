import type { Metadata } from "next";
import { VocationsPage } from "../../components/public-site/VocationsPage";

export const metadata: Metadata = {
  title: "Vocations | Mantus Online",
  description:
    "Compare the five Mantus Online vocations, their playstyles, strengths, tradeoffs, and promotions.",
};

export default function Page() {
  return <VocationsPage />;
}
