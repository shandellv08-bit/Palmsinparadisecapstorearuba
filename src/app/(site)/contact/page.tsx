import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";
import { orNotSet } from "@/lib/engine";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact" };

export default async function Contact({ searchParams }: { searchParams: Promise<{ about?: string }> }) {
  const [s, { about }] = await Promise.all([getSettings(), searchParams]);
  return (
    <div className="wrap page-pad two-col">
      <div>
        <h1>Contact</h1>
        <dl>
          <dt><strong>Phone</strong></dt>
          <dd>{orNotSet(s.phone)}</dd>
          <dt><strong>WhatsApp</strong></dt>
          <dd>{orNotSet(s.whatsapp)}</dd>
          <dt><strong>Email</strong></dt>
          <dd>{orNotSet(s.email)}</dd>
          <dt><strong>Instagram</strong></dt>
          <dd>{orNotSet(s.instagram)}</dd>
          <dt><strong>Address</strong></dt>
          <dd>{orNotSet(s.address)}</dd>
          <dt><strong>Opening hours</strong></dt>
          <dd className="prose">{orNotSet(s.opening_hours)}</dd>
        </dl>
      </div>
      <div className="panel">
        <h2>Send a message</h2>
        <p className="small muted">You can also chat with us using the chat button at the bottom of the page.</p>
        <ContactForm about={about?.slice(0, 120)} />
      </div>
    </div>
  );
}
