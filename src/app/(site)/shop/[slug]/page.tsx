import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getProducts, getSettings } from "@/lib/catalog";
import { fittedSizeValue, formatMoney, isNew, orNotSet, relatedProducts, sortSizes } from "@/lib/engine";
import { photoUrl, siteUrl } from "@/lib/config";
import { PriceSticker } from "@/components/PriceSticker";
import { ProductCard } from "@/components/ProductCard";
import { HowToMeasure, SizeTable } from "@/components/store/SizeGuide";
import { Gallery } from "./Gallery";
import { BuyBox } from "./BuyBox";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    return (await getProducts()).slice(0, 200).map((p) => ({ slug: p.slug }));
  } catch {
    return []; // database unreachable at build time: pages are built on first visit instead
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { title: "Not found" };
  return {
    title: p.name,
    description: p.description?.slice(0, 160) ?? [p.team, p.style, p.colour].filter(Boolean).join(", "),
    openGraph: p.images[0] ? { images: [photoUrl(p.images[0], 1600)] } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const [p, s, all] = await Promise.all([getProduct((await params).slug), getSettings(), getProducts()]);
  if (!p) notFound();
  const order = sortSizes(p.variants.map((v) => v.size));
  const variants = [...p.variants].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
  const fitted = variants.some((v) => fittedSizeValue(v.size) !== null);
  const related = relatedProducts(p, all, 4);
  const details: [string, string | null][] = [
    ["Team", p.team],
    ["Style", p.style],
    ["Colour", p.colour],
    ["Sizes", variants.map((v) => v.size).join(", ") || null],
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    image: p.images.map((i) => photoUrl(i, 1600)),
    offers: s.currency
      ? {
          "@type": "Offer",
          price: (p.price_cents / 100).toFixed(2),
          priceCurrency: s.currency,
          availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: `${siteUrl()}/shop/${p.slug}`,
        }
      : undefined,
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p className="crumbs" style={{ paddingTop: "1rem" }}>
        <Link href="/">Home</Link> / <Link href="/shop">Shop</Link>
        {p.team ? (
          <>
            {" / "}
            <Link href={`/shop?${new URLSearchParams({ team: p.team })}`}>{p.team}</Link>
          </>
        ) : null}
      </p>
      <div className="pdp">
        <Gallery images={p.images} name={p.name} soldOut={!p.in_stock} />
        <div className="buybox">
          <p className="eyebrow">
            {[p.team, p.style].filter(Boolean).join(" · ")}
            {isNew(p.created_at) ? <span className="badge papaya" style={{ marginLeft: ".5rem" }}>New</span> : null}
          </p>
          <h1>{p.name}</h1>
          <div className="price-row">
            <PriceSticker cents={p.price_cents} currency={s.currency} large />
            <div className="meta">
              <span className="sr-only">Price: {formatMoney(p.price_cents, s.currency)}. </span>
              {p.colour ? <div>Colour: {p.colour}</div> : null}
              <div>{p.in_stock ? "In stock" : "Sold out"}</div>
            </div>
          </div>
          <BuyBox
            product={{ slug: p.slug, name: p.name, priceCents: p.price_cents, image: p.images[0] ?? null }}
            variants={variants}
            currency={s.currency}
            sizeGuide={
              fitted ? (
                <>
                  <SizeTable highlight={variants.filter((v) => v.in_stock).map((v) => v.size)} />
                  <p className="small muted" style={{ marginTop: ".75rem" }}>Highlighted sizes are in stock for this cap.</p>
                  <HowToMeasure />
                </>
              ) : null
            }
          />
          <div className="accordion">
            <details open>
              <summary>Details</summary>
              <div className="inner">
                {p.description ? <p className="prose">{p.description}</p> : null}
                <dl>
                  {details.map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{orNotSet(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </details>
            <details>
              <summary>Pickup &amp; delivery</summary>
              <div className="inner">
                <p>
                  <strong>Pickup:</strong> {s.pickup_enabled ? orNotSet(s.pickup_instructions ?? s.address) : "not available right now"}
                </p>
                <p>
                  <strong>Delivery:</strong>{" "}
                  {s.delivery_enabled && s.delivery_fee_cents !== null
                    ? `${formatMoney(s.delivery_fee_cents, s.currency)}${s.free_delivery_threshold_cents !== null ? `, free from ${formatMoney(s.free_delivery_threshold_cents, s.currency)}` : ""}. Areas: ${orNotSet(s.delivery_areas)}`
                    : "not available right now"}
                </p>
              </div>
            </details>
            <details>
              <summary>Returns</summary>
              <div className="inner">
                <p className="prose">{orNotSet(s.returns_policy)}</p>
              </div>
            </details>
          </div>
        </div>
      </div>
      {related.length ? (
        <section className="band" aria-labelledby="rel-h">
          <div className="band-head">
            <h2 id="rel-h">{p.team && related.some((r) => r.team === p.team) ? `More ${p.team}` : "You may also like"}</h2>
          </div>
          <div className="pgrid wide">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} currency={s.currency} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
