import { notFound } from "next/navigation";
import { FacilityPage } from "@/components/areas/facility-page";
import { airportCopy } from "@/content/seo-copy";
import { airports } from "@/content/site";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return airports.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const a = airports.find((x) => x.slug === slug);
  if (!a) return {};
  return pageMeta({ title: `${a.code} Luggage Service, ${a.name}`, description: airportCopy[a.code].intro.slice(0, 158), path: `/airports/${a.slug}` });
}

export default async function AirportPage({ params }: Props) {
  const { slug } = await params;
  const a = airports.find((x) => x.slug === slug);
  if (!a) notFound();
  return (
    <FacilityPage
      kind="airport"
      name={a.officialName ? "West Palm Beach airport" : a.name}
      code={a.code}
      path={`/airports/${a.slug}`}
      marketSlug={a.market}
      copy={airportCopy[a.code]}
      altNames={a.officialName ? `Official name: ${a.officialName}. Also known as ${a.name} (${a.code}).` : undefined}
    />
  );
}
