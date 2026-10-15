import type { Metadata } from "next";
import { SurveyForm } from "@/components/notifications/survey-form";

export const metadata: Metadata = {
  title: "Rate your experience",
  description: "Tell us how your Express Bags delivery went.",
  robots: { index: false, follow: false },
};

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <section className="relative overflow-hidden bg-navy">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 hidden h-[34rem] w-[34rem] rounded-full border-[3px] border-orange/60 md:block" />
      <div className="container-eb relative py-12 md:py-20">
        <SurveyForm token={token} />
      </div>
      <div className="flight-line opacity-70" aria-hidden />
    </section>
  );
}
