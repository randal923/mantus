import type { Metadata } from "next";
import { GuildProfilePage } from "../../../components/public-site/GuildProfilePage";

interface PageProps {
  readonly params: Promise<{ readonly name: string }>;
}

function decodeGuildName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { name } = await params;
  const decodedName = decodeGuildName(name);
  return {
    title: `${decodedName} | Mantus Online`,
    description: `Members and ranks of the ${decodedName} guild on Mantus Online.`,
  };
}

export default async function Page({ params }: PageProps) {
  const { name } = await params;
  return <GuildProfilePage name={decodeGuildName(name)} />;
}
