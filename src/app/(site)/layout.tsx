import Link from "next/link";
import { CartProvider } from "@/components/cart";
import { SiteHeader } from "@/components/SiteHeader";
import { BagDrawer } from "@/components/BagDrawer";
import { ChatWidget } from "@/components/ChatWidget";
import { Wordmark } from "@/components/Wordmark";
import { getProducts, getSettings } from "@/lib/catalog";
import { getMode } from "@/lib/config";
import { orNotSet } from "@/lib/engine";
import { displayName } from "@/lib/settings";
import { navFacets } from "@/lib/nav";
import "./store.css";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const mode = getMode();
  const [s, products] = await Promise.all([getSettings(), getProducts()]);
  const name = displayName(s);
  const { styles, teams } = navFacets(products);
  return (
    <CartProvider>
      <div className="store">
        <a href="#main" className="skip">
          Skip to content
        </a>
        {mode === "demo" ? (
          <div className="demo-strip" role="note">
            Demo mode: sample items only. No database is connected and nothing is saved.
          </div>
        ) : null}
        {mode === "unconfigured" ? (
          <div className="demo-strip" role="note">
            The store is being set up. Orders are not open yet.
          </div>
        ) : null}
        {s.announcement ? <div className="announce">{s.announcement}</div> : null}
        <SiteHeader name={name} styles={styles} teams={teams} />
        <BagDrawer currency={s.currency} />
        <main id="main">{children}</main>
        {mode === "live" ? <ChatWidget hours={s.opening_hours} businessName={name} /> : null}
        <footer className="store-footer">
          <div className="wrap top">
            <div>
              <Wordmark name={name} />
              {s.tagline ? <p style={{ marginTop: "1rem" }}>{s.tagline}</p> : null}
              <dl style={{ marginTop: "1.25rem" }}>
                <dt>Phone</dt>
                <dd>{orNotSet(s.phone)}</dd>
                <dt>WhatsApp</dt>
                <dd>{orNotSet(s.whatsapp)}</dd>
                <dt>Email</dt>
                <dd>{orNotSet(s.email)}</dd>
                <dt>Instagram</dt>
                <dd>{orNotSet(s.instagram)}</dd>
              </dl>
            </div>
            <nav aria-labelledby="f-shop">
              <h2 id="f-shop">Shop</h2>
              <ul>
                <li><Link href="/shop?sort=newest">New arrivals</Link></li>
                {styles.slice(0, 5).map((st) => (
                  <li key={st.name}>
                    <Link href={`/shop?${new URLSearchParams({ style: st.name })}`}>{st.name}</Link>
                  </li>
                ))}
                <li><Link href="/shop">All caps</Link></li>
              </ul>
            </nav>
            <nav aria-labelledby="f-help">
              <h2 id="f-help">Help</h2>
              <ul>
                <li><Link href="/info/size-guide">Size guide</Link></li>
                <li><Link href="/info/delivery">Pickup &amp; delivery</Link></li>
                <li><Link href="/info/returns">Returns</Link></li>
                <li><Link href="/contact">Contact</Link></li>
              </ul>
            </nav>
            <div>
              <h2>Visit</h2>
              <dl>
                <dt>Address</dt>
                <dd>{orNotSet(s.address)}</dd>
                <dt>Hours</dt>
                <dd className="prose">{orNotSet(s.opening_hours)}</dd>
              </dl>
            </div>
          </div>
          <div className="wrap bottom">
            <span>
              © {new Date().getFullYear()} {name}
            </span>
            <span className="row">
              <Link href="/info/about">About</Link>
              <Link href="/info/privacy">Privacy</Link>
              <Link href="/info/terms">Terms</Link>
            </span>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
