import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { LegalDoc } from "@/components/company/blocks";
import { contact } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Accessibility Statement | Express Bags, Inc.",
  description: "Express Bags is committed to an accessible website that works for everyone, aiming for WCAG 2.2 Level AA.",
  path: "/accessibility",
});

export default function AccessibilityPage() {
  return (
    <>
      <PageHero title="Accessibility Statement" crumbs={[{ name: "Home", path: "/" }, { name: "Accessibility", path: "/accessibility" }]} primaryCta={null} />
      <LegalDoc
        updated="October 15, 2026"
        sections={[
          { id: "commitment", title: "Our commitment", body: <p>Express Bags wants every visitor, including people who use assistive technology, to be able to learn about our services and request a quote. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA.</p> },
          { id: "measures", title: "What we do", body: (<ul>
            <li>Semantic page structure with clear headings and landmarks.</li>
            <li>Keyboard navigation with visible focus indicators and a skip-to-content link.</li>
            <li>Text alternatives for meaningful images and labels for every form field.</li>
            <li>Color contrast that meets AA guidelines for text and controls.</li>
            <li>Layouts that adapt to phones, tablets, zoom and larger text.</li>
            <li>Respect for reduced-motion preferences.</li>
            <li>Automated accessibility checks plus manual review before changes go live.</li>
          </ul>) },
          { id: "limits", title: "Known limitations", body: <p>Some third-party tools, such as embedded maps, chat widgets or carrier tracking pages, may not fully meet our standards. We choose providers with accessibility in mind and offer alternatives on request.</p> },
          { id: "feedback", title: "Feedback and help", body: <p>If you have trouble using any part of this website, please call our office at {contact.phoneDisplay} during office hours. We will help you complete your request by phone and work to fix the issue.</p> },
        ]}
      />
    </>
  );
}
