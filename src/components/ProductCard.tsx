import Link from "next/link";
import { availabilityLabel, isNew, type CatalogProduct } from "@/lib/engine";
import { ProductImage } from "./ProductImage";
import { PriceSticker } from "./PriceSticker";

/** Product tile: photo (second photo on hover), badges, team, name, price sticker, availability. */
export function ProductCard({ p, currency, priority }: { p: CatalogProduct; currency: string | null; priority?: boolean }) {
  const fresh = isNew(p.created_at);
  return (
    <Link href={`/shop/${p.slug}`} className="pcard card">
      <div className="media">
        <div className="badges">
          {!p.in_stock ? <span className="badge out">Sold out</span> : fresh ? <span className="badge papaya">New</span> : null}
        </div>
        <ProductImage images={p.images} alt={p.name} soldOut={!p.in_stock} priority={priority} />
        {p.images[1] ? (
          <div className="alt" aria-hidden="true">
            <ProductImage images={[p.images[1]]} alt="" />
          </div>
        ) : null}
        <PriceSticker cents={p.price_cents} currency={currency} />
      </div>
      <p className="team">{[p.team, p.style].filter(Boolean).join(" · ") || " "}</p>
      <h3 className="pname">{p.name}</h3>
      <p className={`avail${p.in_stock ? "" : " out"}`}>{availabilityLabel(p)}</p>
    </Link>
  );
}
