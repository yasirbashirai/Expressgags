import { notFound } from "next/navigation";
import { FacilityPage } from "@/components/areas/facility-page";
import { portCopy } from "@/content/seo-copy";
import { ports } from "@/content/site";
import { pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ports.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = ports.find((x) => x.slug === slug);
  if (!p) return {};
  return pageMeta({ title: `${p.name} Cruise Luggage Service`, description: portCopy[p.slug].intro.slice(0, 158), path: `/ports/${p.slug}` });
}

export default async function PortPage({ params }: Props) {
  const { slug } = await params;
  const p = ports.find((x) => x.slug === slug);
  if (!p) notFound();
  return <FacilityPage kind="port" name={p.name} path={`/ports/${p.slug}`} marketSlug={p.market} copy={portCopy[p.slug]} />;
}
