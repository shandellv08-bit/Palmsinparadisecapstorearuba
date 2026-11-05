import type { Metadata } from "next";
import Link from "next/link";
import { getProducts, getSettings } from "@/lib/catalog";
import { facets, filterProducts, parseFilter } from "@/lib/engine";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = { title: "Shop", description: "Every cap in the store, with sizes in stock." };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Shop({ searchParams }: { searchParams: Params }) {
  const f = parseFilter(await searchParams);
  const [s, products] = await Promise.all([getSettings(), getProducts()]);
  const { teams, styles, sizes } = facets(products);
  const list = filterProducts(products, f);
  const filtered = Boolean(f.q || f.team || f.style || f.size || f.inStock);

  return (
    <div className="wrap section">
      <h1>Shop</h1>
      {/* Plain GET form: works without JavaScript and every filter has a shareable URL. */}
      <form className="filters" method="get" role="search" aria-label="Filter caps">
        <div className="field search">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={f.q} placeholder="Team, style or colour" />
        </div>
        <div className="field">
          <label htmlFor="team">Team</label>
          <select id="team" name="team" defaultValue={f.team ?? ""}>
            <option value="">All</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select id="style" name="style" defaultValue={f.style ?? ""}>
            <option value="">All</option>
            {styles.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="size">Size</label>
          <select id="size" name="size" defaultValue={f.size ?? ""}>
            <option value="">All</option>
            {sizes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={f.sort}>
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
          </select>
        </div>
        <div className="field">
          <label className="choice" htmlFor="stock">
            <input id="stock" name="stock" type="checkbox" value="1" defaultChecked={f.inStock} />
            In stock only
          </label>
          <button className="btn small block" type="submit">
            Apply
          </button>
        </div>
      </form>
      <p className="muted" aria-live="polite">
        {list.length} {list.length === 1 ? "cap" : "caps"}
        {filtered ? (
          <>
            {" · "}
            <Link href="/shop">Clear filters</Link>
          </>
        ) : null}
      </p>
      {list.length === 0 ? (
        <p className="empty">No caps match these filters.</p>
      ) : (
        <div className="grid-products">
          {list.map((p, i) => (
            <ProductCard key={p.id} p={p} currency={s.currency} priority={i < 2} />
          ))}
        </div>
      )}
    </div>
  );
}
