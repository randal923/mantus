import type { Metadata } from "next";
import { CharacterProfilePage } from "../../../components/public-site/CharacterProfilePage";

interface PageProps {
  readonly params: Promise<{ readonly name: string }>;
}

function decodeCharacterName(name: string): string {
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
  const decodedName = decodeCharacterName(name);
  return {
    title: `${decodedName} | Mantus Online`,
    description: `View ${decodedName}'s public Mantus Online character profile.`,
  };
}

export default async function Page({ params }: PageProps) {
  const { name } = await params;
  return <CharacterProfilePage name={decodeCharacterName(name)} />;
}
