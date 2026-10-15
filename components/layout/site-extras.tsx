import { ChatWidget } from "@/components/assistant/chat-widget";
import { ConsentAndTags } from "@/components/marketing/consent-and-tags";

/** Site-wide client extras mounted once in the public layout. Each widget is owned by its module. */
export function SiteExtras() {
  return (
    <>
      <ConsentAndTags />
      <ChatWidget />
    </>
  );
}
