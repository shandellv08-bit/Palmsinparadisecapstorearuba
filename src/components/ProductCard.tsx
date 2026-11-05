import Link from "next/link";
import type { CatalogProduct } from "@/lib/engine";
import { ProductImage } from "./ProductImage";
import { PriceSticker } from "./PriceSticker";

export function ProductCard({ p, currency, priority }: { p: CatalogProduct; currency: string | null; priority?: boolean }) {
  return (
    <Link href={`/shop/${p.slug}`} className="card">
      <ProductImage images={p.images} alt={p.name} soldOut={!p.in_stock} priority={priority} />
      <PriceSticker cents={p.price_cents} currency={currency} />
      <h3>{p.name}</h3>
      <div className="meta">
        {[p.team, p.style].filter(Boolean).join(" · ")}
        {!p.in_stock ? (
          <>
            {" "}
            <span className="tag bad">Sold out</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
