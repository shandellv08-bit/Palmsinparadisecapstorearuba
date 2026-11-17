import Link from "next/link";
import { getProducts, getSettings } from "@/lib/catalog";
import { filterProducts, formatMoney } from "@/lib/engine";
import { navFacets } from "@/lib/nav";
import { displayName } from "@/lib/settings";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { PriceSticker } from "@/components/PriceSticker";
import { Fronds, PalmMark, PinIcon, TruckIcon, ChatIcon } from "@/components/icons";

export const revalidate = 60;

const shopLink = (k: string, v: string) => `/shop?${new URLSearchParams({ [k]: v })}`;

export default async function Home() {
  const [s, products] = await Promise.all([getSettings(), getProducts()]);
  const name = displayName(s);
  const main = name.replace(/\s*,?\s*Aruba$/i, "");
  const featured = filterProducts(products, { sort: "featured" });
  const newest = filterProducts(products, { sort: "newest", inStock: true }).slice(0, 8);
  const hero = featured.find((p) => p.in_stock && p.images.length) ?? featured.find((p) => p.in_stock) ?? featured[0];
  const { styles, teams } = navFacets(products);
  const delivery = s.delivery_enabled && s.delivery_fee_cents !== null;

  return (
    <>
      <section className="hero-banner" aria-labelledby="hero-h">
        <Fronds className="fronds" />
        <div className="wrap">
          <div>
            <p className="eyebrow" style={{ color: "var(--papaya)" }}>
              Caps · Aruba
            </p>
            <h1 id="hero-h" className="display">
              {main}
              <em>Aruba</em>
            </h1>
            <p className="lead">{s.tagline ?? `See what is in stock right now and order online${s.pickup_enabled && delivery ? ". Pick up or get it delivered on the island." : s.pickup_enabled ? " for pickup on the island." : delivery ? " for delivery on the island." : "."}`}</p>
            <div className="row">
              <Link href="/shop?sort=newest" className="btn">
                Shop new arrivals
              </Link>
              <Link href="/shop" className="btn ghost">
                All caps
              </Link>
            </div>
          </div>
          {hero ? (
            <div className="hero-art">
              <Link href={`/shop/${hero.slug}`} aria-label={`${hero.name}, ${formatMoney(hero.price_cents, s.currency)}`}>
                <ProductImage images={hero.images} alt="" priority sizes="(min-width: 860px) 40vw, 90vw" />
              </Link>
              <PriceSticker cents={hero.price_cents} currency={s.currency} large />
              <p className="label">
                <Link href={`/shop/${hero.slug}`}>{hero.name}</Link>
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {styles.length ? (
        <section className="band wrap" aria-labelledby="styles-h">
          <div className="band-head">
            <h2 id="styles-h">Shop by style</h2>
            <Link href="/info/size-guide">Size guide</Link>
          </div>
          <div className="style-tiles">
            {styles.slice(0, 4).map((st) => (
              <Link key={st.name} href={shopLink("style", st.name)} className="style-tile">
                <PalmMark />
                <span className="t">{st.name}</span>
                <span className="n">
                  {st.count} {st.count === 1 ? "cap" : "caps"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {newest.length ? (
        <section className="band sand" aria-labelledby="new-h">
          <div className="wrap">
            <div className="band-head">
              <h2 id="new-h">New arrivals</h2>
              <Link href="/shop?sort=newest">Shop all new</Link>
            </div>
            <div className="rail">
              {newest.map((p) => (
                <ProductCard key={p.id} p={p} currency={s.currency} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {teams.length ? (
        <section className="band wrap" aria-labelledby="teams-h">
          <div className="band-head">
            <h2 id="teams-h">Shop by team</h2>
            <Link href="/shop">All caps</Link>
          </div>
          <div className="team-tiles">
            {teams.map((t) => (
              <Link key={t.name} href={shopLink("team", t.name)} className="team-tile">
                {t.name} <span>{t.count} {t.count === 1 ? "cap" : "caps"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="band wrap" aria-labelledby="featured-h">
        <div className="band-head">
          <h2 id="featured-h">In the store</h2>
          <Link href="/shop">See all {products.length}</Link>
        </div>
        {featured.length === 0 ? (
          <p className="empty">No caps are listed yet.</p>
        ) : (
          <div className="pgrid wide">
            {featured.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} currency={s.currency} />
            ))}
          </div>
        )}
      </section>

      <section className="band sea" aria-label="How it works">
        <div className="wrap info-strip">
          <div>
            <PinIcon />
            <div>
              <h3>Pickup</h3>
              <p>{s.pickup_enabled ? (s.pickup_instructions ?? "Collect your order in Aruba.") : "Not available right now."} <Link href="/info/delivery">Details</Link></p>
            </div>
          </div>
          <div>
            <TruckIcon />
            <div>
              <h3>Delivery</h3>
              <p>
                {delivery
                  ? `${formatMoney(s.delivery_fee_cents!, s.currency)}${s.free_delivery_threshold_cents !== null ? `, free from ${formatMoney(s.free_delivery_threshold_cents, s.currency)}` : ""}. `
                  : "Not available right now. "}
                <Link href="/info/delivery">Areas</Link>
              </p>
            </div>
          </div>
          <div>
            <ChatIcon />
            <div>
              <h3>Questions</h3>
              <p>
                Ask about sizes or restocks. <Link href="/contact">Contact us</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
