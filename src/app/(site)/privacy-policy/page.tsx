import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { LegalDoc } from "@/components/company/blocks";
import { company, contact } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Privacy Policy | Express Bags, Inc.",
  description: "How Express Bags, Inc. collects, uses, shares and protects personal information submitted through express-bags.com.",
  path: "/privacy-policy",
});

const UPDATED = "October 15, 2026";

export default function PrivacyPage() {
  return (
    <>
      <PageHero title="Privacy Policy" crumbs={[{ name: "Home", path: "/" }, { name: "Privacy Policy", path: "/privacy-policy" }]} primaryCta={null} />
      <LegalDoc
        updated={UPDATED}
        sections={[
          { id: "who", title: "Who we are", body: <p>{company.name} (&quot;Express Bags&quot;, &quot;we&quot;, &quot;us&quot;) is a Florida luggage and commercial logistics company. Our mailing address is {contact.addressLine}. This policy explains how we handle personal information collected through our website, quote requests, contact forms, job applications and related communications.</p> },
          { id: "collect", title: "Information we collect", body: (<>
            <p>We collect only what we need to quote, plan and complete a job or respond to you:</p>
            <ul>
              <li>Contact details: name, email, phone, company and preferred contact method.</li>
              <li>Job details: pickup and delivery locations, dates, time windows, flight, cruise or event details, item counts, sizes, weights, special handling notes and uploaded files such as manifests.</li>
              <li>Billing details for business accounts, such as billing contacts and purchase-order references. Card data, when online payment is offered, is processed by our payment provider and is not stored on our servers.</li>
              <li>Job applications: the information and resume you choose to submit.</li>
              <li>Technical data: device, browser, pages visited and how you reached our site, collected through cookies and analytics tools.</li>
            </ul>
          </>) },
          { id: "use", title: "How we use information", body: (<ul>
            <li>To prepare quotations, confirm bookings, dispatch jobs and send status updates and proof of delivery.</li>
            <li>To manage business accounts, invoicing and customer service.</li>
            <li>To review job applications.</li>
            <li>To improve our website and services and measure which channels bring inquiries.</li>
            <li>To meet legal, safety, security and accounting obligations.</li>
          </ul>) },
          { id: "driver", title: "Team member privacy", body: <p>We protect the identities of our employees. The website never publishes team member names, photos, schedules or personal details. When a booking is confirmed and dispatch assigns a driver, only the customer holding that booking may receive the assigned driver&apos;s name and approved job-specific contact information, solely for that job.</p> },
          { id: "share", title: "When we share information", body: (<>
            <p>We do not sell personal information. We share it only as needed to provide our services:</p>
            <ul>
              <li>With service providers that host our systems, send messages, process payments, run our CRM or dispatch software, under confidentiality obligations.</li>
              <li>With national carriers when a shipment is handed to a carrier on your behalf.</li>
              <li>With facility operators (for example airports, ports, hotels or venues) when required to complete an authorized handoff.</li>
              <li>When required by law or to protect people, property or our rights.</li>
            </ul>
          </>) },
          { id: "cookies", title: "Cookies, analytics and advertising", body: (<>
            <p>We ask for your choice before using optional cookies. Necessary cookies keep the site and your account working. Analytics cookies (Google Analytics) help us understand how the site is used. Marketing cookies (Google Ads and Meta) measure which advertising leads to inquiries. Optional tags load only after you allow them, and you can change your choice at any time through the &quot;Cookie settings&quot; link in the footer.</p>
            <p>When you send a quote request we keep basic campaign information with it, such as the referring site, landing page and campaign source, so we can tell which channels help customers find us. Advertising click identifiers, and server-side conversion reporting to Meta using hashed (scrambled) email and phone details, are used only if you allow marketing cookies.</p>
          </>) },
          { id: "messages", title: "Booking messages, texts and surveys", body: (<>
            <p>We send email updates about your quote, booking and delivery. If you give us a mobile number and text or WhatsApp updates are enabled, we may also send short job updates. We hold non-urgent texts between 9 PM and 7 AM Eastern time. Reply STOP to any text to opt out, and START to opt back in. Message and data rates may apply.</p>
            <p>After a delivery we may invite you to a short satisfaction survey. Your rating and comment help us improve. We publish a comment only if you tick the box giving us permission, and only with the attribution you choose. Survey and review emails include an unsubscribe link; booking messages continue so you stay informed about your job.</p>
          </>) },
          { id: "assistant", title: "Website assistant", body: <p>Our website assistant answers questions using Express Bags&apos; published information. Conversations are stored so we can follow up and improve answers; we do not store your full IP address. Please do not share payment card details in the chat. If you ask to speak with a person, the contact details you provide are passed to our office.</p> },
          { id: "providers", title: "Service providers", body: <p>We use trusted providers to run our services, for example for email delivery, text messaging (Twilio), online payments (Stripe), shipping labels and carrier tracking, accounting, mapping and website analytics. They process information on our behalf for these purposes only.</p> },
          { id: "retention", title: "Retention and security", body: <p>We keep job, booking and invoice records for as long as needed for service, customer support, accounting and legal requirements, then delete or anonymize them. We use access controls, encryption in transit and role-based permissions to protect information. No system is perfectly secure, so please contact us promptly if you suspect a problem.</p> },
          { id: "choices", title: "Your choices", body: <p>You may ask us to access, correct or delete your personal information, or to stop marketing messages, by calling {contact.phoneDisplay} or writing to {contact.addressLine}. We may need to keep certain records where the law requires.</p> },
          { id: "children", title: "Children", body: <p>Our website is intended for adults and businesses. We do not knowingly collect information from children under 13.</p> },
          { id: "changes", title: "Changes to this policy", body: <p>We may update this policy. The date at the top shows the latest version.</p> },
        ]}
      />
    </>
  );
}
