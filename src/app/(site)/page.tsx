import Link from "next/link";
import { getProducts, getSettings } from "@/lib/catalog";
import { filterProducts } from "@/lib/engine";
import { ProductCard } from "@/components/ProductCard";
import { displayName } from "@/lib/settings";

export const revalidate = 60;

export default async function Home() {
  const [s, products] = await Promise.all([getSettings(), getProducts()]);
  const shown = filterProducts(products, { sort: "featured" }).slice(0, 8);
  const ways = [s.pickup_enabled ? "pickup" : null, s.delivery_enabled ? "delivery" : null].filter(Boolean);
  return (
    <>
      <section className="wrap hero">
        <div>
          <h1>{displayName(s)}</h1>
          <p className="lead">{s.tagline ?? "Caps in Aruba. See what is in stock, order online, and collect or get it delivered."}</p>
          <div className="row">
            <Link href="/shop" className="btn">
              Shop caps
            </Link>
            <Link href="/info/delivery" className="btn ghost">
              How {ways.length ? ways.join(" and ") : "ordering"} works
            </Link>
          </div>
        </div>
        {shown[0] ? (
          <div aria-hidden="true">
            <ProductCard p={shown[0]} currency={s.currency} priority />
          </div>
        ) : null}
      </section>
      <section className="wrap section" aria-labelledby="in-store">
        <div className="spread">
          <h2 id="in-store">In the store</h2>
          <Link href="/shop">See all</Link>
        </div>
        {shown.length === 0 ? (
          <p className="empty">No caps are listed yet.</p>
        ) : (
          <div className="grid-products">
            {shown.map((p) => (
              <ProductCard key={p.id} p={p} currency={s.currency} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
