import { ClaimDetailPage } from "@/components/protection/portal-claims";

export const metadata = { title: "Claim", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filed?: string }> }) {
  const [{ id }, { filed }] = await Promise.all([params, searchParams]);
  return <ClaimDetailPage id={id} filed={filed === "1"} />;
}
