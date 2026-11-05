import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getSettings } from "@/lib/catalog";
import { formatMoney, sortSizes } from "@/lib/engine";
import { photoUrl } from "@/lib/config";
import { ProductImage } from "@/components/ProductImage";
import { PriceSticker } from "@/components/PriceSticker";
import { AddToOrder } from "./AddToOrder";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

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
  const [p, s] = await Promise.all([getProduct((await params).slug), getSettings()]);
  if (!p) notFound();
  const order = sortSizes(p.variants.map((v) => v.size));
  const variants = [...p.variants].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
  const details: [string, string | null][] = [
    ["Team", p.team],
    ["Style", p.style],
    ["Colour", p.colour],
  ];
  return (
    <div className="wrap section">
      <p className="small">
        <Link href="/shop">Shop</Link> / {p.name}
      </p>
      <div className="two-col">
        <div className="stack">
          <ProductImage images={p.images} alt={p.name} soldOut={!p.in_stock} priority sizes="(min-width: 860px) 50vw, 100vw" />
          {p.images.length > 1 ? (
            <div className="photos">
              {p.images.slice(1).map((img, i) => (
                <ProductImage key={img} images={[img]} alt={`${p.name}, photo ${i + 2}`} sizes="120px" />
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <div className="spread">
            <h1>{p.name}</h1>
            <PriceSticker cents={p.price_cents} currency={s.currency} large />
          </div>
          <p className="sr-only">Price: {formatMoney(p.price_cents, s.currency)}</p>
          <dl className="row small">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k}>
                  <dt className="sr-only">{k}</dt>
                  <dd style={{ margin: 0 }} className="tag">
                    {v}
                  </dd>
                </span>
              ))}
          </dl>
          {p.description ? <p className="prose">{p.description}</p> : null}
          <AddToOrder
            product={{ slug: p.slug, name: p.name, priceCents: p.price_cents, image: p.images[0] ?? null }}
            variants={variants}
          />
        </div>
      </div>
    </div>
  );
}
