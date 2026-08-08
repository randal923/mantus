import type { Metadata } from "next";
import { VipAccountPage } from "../../components/public-site/VipAccountPage";

export const metadata: Metadata = {
  title: "VIP Account | Mantus Online",
  description:
    "Every bonus a VIP account enjoys on Mantus Online: faster regeneration, extra experience, protected imbuements, and more.",
};

export default function Page() {
  return <VipAccountPage />;
}
