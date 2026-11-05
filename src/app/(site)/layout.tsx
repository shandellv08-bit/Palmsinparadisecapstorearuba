import Link from "next/link";
import { CartProvider } from "@/components/cart";
import { SiteHeader } from "@/components/SiteHeader";
import { getSettings } from "@/lib/catalog";
import { getMode } from "@/lib/config";
import { orNotSet } from "@/lib/engine";
import { displayName } from "@/lib/settings";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const mode = getMode();
  const s = await getSettings();
  const name = displayName(s);
  return (
    <CartProvider>
      <a href="#main" className="skip">
        Skip to content
      </a>
      {mode === "demo" ? (
        <div className="banner" role="note">
          Demo mode: sample items only. No database is connected and nothing is saved.
        </div>
      ) : null}
      {mode === "unconfigured" ? (
        <div className="banner" role="note">
          The store is being set up. Orders are not open yet.
        </div>
      ) : null}
      <SiteHeader name={name} />
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="wrap grid">
          <div>
            <p className="brand">{name}</p>
            {s.tagline ? <p>{s.tagline}</p> : null}
          </div>
          <dl>
            <dt>Phone</dt>
            <dd>{orNotSet(s.phone)}</dd>
            <dt>WhatsApp</dt>
            <dd>{orNotSet(s.whatsapp)}</dd>
            <dt>Email</dt>
            <dd>{orNotSet(s.email)}</dd>
          </dl>
          <dl>
            <dt>Address</dt>
            <dd>{orNotSet(s.address)}</dd>
            <dt>Opening hours</dt>
            <dd className="prose">{orNotSet(s.opening_hours)}</dd>
          </dl>
          <nav aria-label="Store information">
            <ul className="checklist">
              <li><Link href="/info/about">About</Link></li>
              <li><Link href="/info/delivery">Pickup &amp; delivery</Link></li>
              <li><Link href="/info/returns">Returns</Link></li>
              <li><Link href="/info/privacy">Privacy</Link></li>
              <li><Link href="/info/terms">Terms</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    </CartProvider>
  );
}
