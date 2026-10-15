import { redirect } from "next/navigation";

/** Legacy "Client Login" link (footer/help nav) → the customer portal sign-in. */
export default function ClientLoginPage() {
  redirect("/account/login");
}
