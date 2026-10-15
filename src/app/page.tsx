// Temporary home page — replaced by the pages agent.
import { PageHero } from "@/components/ui/page-hero";
export default function Home() {
  return <PageHero title="Express Bags" crumbs={[{ name: "Home", path: "/" }]} />;
}
