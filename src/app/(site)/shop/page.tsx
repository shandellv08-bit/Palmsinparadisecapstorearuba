import type { Metadata } from "next";
import Link from "next/link";
import { getProducts, getSettings } from "@/lib/catalog";
import { facets, filterProducts, parseFilter, shopTitle, type CatalogFilter, type CatalogProduct } from "@/lib/engine";
import { ProductCard } from "@/components/ProductCard";
import { SortSelect } from "./SortSelect";
import { MobileFilters } from "./MobileFilters";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const f = parseFilter(await searchParams);
  return { title: shopTitle(f), description: "Caps in stock in Aruba, with sizes available." };
}

/** Builds a shop URL from the current filter with one key changed (undefined removes it). */
function href(f: CatalogFilter, change: Partial<Record<"q" | "team" | "style" | "size" | "stock" | "sort", string | undefined>>) {
  const cur: Record<string, string | undefined> = { q: f.q, team: f.team, style: f.style, size: f.size, stock: f.inStock ? "1" : undefined, sort: f.sort === "featured" ? undefined : f.sort };
  const next = { ...cur, ...change };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/shop?${s}` : "/shop";
}

function Facets({ f, products }: { f: CatalogFilter; products: CatalogProduct[] }) {
  const { teams, styles, sizes } = facets(products);
  // counts reflect the other active filters, so a click never leads to an empty page by surprise
  const countFor = (key: "team" | "style", value: string) => filterProducts(products, { ...f, [key]: value, sort: "featured" }).length;
  const list = (key: "team" | "style", values: string[], label: string) =>
    values.length ? (
      <details className="facet" open>
        <summary>{label}</summary>
        <ul>
          {values.map((v) => {
            const on = f[key] === v;
            return (
              <li key={v}>
                <Link href={href(f, { [key]: on ? undefined : v })} aria-current={on ? "true" : undefined} rel="nofollow">
                  <span className="lbl">
                    <span className="box" aria-hidden="true" />
                    {v}
                  </span>
                  <span className="c">{countFor(key, v)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </details>
    ) : null;
  return (
    <>
      <details className="facet" open>
        <summary>Availability</summary>
        <ul>
          <li>
            <Link href={href(f, { stock: f.inStock ? undefined : "1" })} aria-current={f.inStock ? "true" : undefined} rel="nofollow">
              <span className="lbl">
                <span className="box" aria-hidden="true" />
                In stock only
              </span>
            </Link>
          </li>
        </ul>
      </details>
      {list("style", styles, "Style")}
      {sizes.length ? (
        <details className="facet" open>
          <summary>Size</summary>
          <div className="size-chips">
            {sizes.map((sz) => (
              <Link key={sz} href={href(f, { size: f.size === sz ? undefined : sz })} aria-current={f.size === sz ? "true" : undefined} rel="nofollow">
                {sz}
              </Link>
            ))}
          </div>
          <p className="small" style={{ marginTop: ".6rem" }}>
            <Link href="/info/size-guide">Size guide</Link>
          </p>
        </details>
      ) : null}
      {list("team", teams, "Team")}
    </>
  );
}

export default async function Shop({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const f = parseFilter(raw);
  const [s, products] = await Promise.all([getSettings(), getProducts()]);
  const list = filterProducts(products, f);
  const title = shopTitle(f);
  const active: [string, string, Partial<Record<string, undefined>>][] = [
    ...(f.q ? [[`“${f.q}”`, "q", { q: undefined }] as [string, string, Partial<Record<string, undefined>>]] : []),
    ...(f.style ? [[f.style, "style", { style: undefined }] as [string, string, Partial<Record<string, undefined>>]] : []),
    ...(f.team ? [[f.team, "team", { team: undefined }] as [string, string, Partial<Record<string, undefined>>]] : []),
    ...(f.size ? [[`Size ${f.size}`, "size", { size: undefined }] as [string, string, Partial<Record<string, undefined>>]] : []),
    ...(f.inStock ? [["In stock", "stock", { stock: undefined }] as [string, string, Partial<Record<string, undefined>>]] : []),
  ];

  return (
    <div className="wrap">
      <div className="collection-head">
        <p className="crumbs">
          <Link href="/">Home</Link> / <Link href="/shop">Shop</Link>
          {title !== "All caps" ? ` / ${title}` : null}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="collection">
        <aside className="facets" aria-label="Filters">
          <Facets f={f} products={products} />
        </aside>
        <div>
          <div className="toolbar">
            <MobileFilters count={active.length}>
              <form action="/shop" role="search" className="header-search" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <label htmlFor="sq" className="sr-only">
                  Search caps
                </label>
                <input id="sq" name="q" type="search" defaultValue={f.q} placeholder="Search caps" autoFocus={raw.focus === "search"} />
              </form>
              <Facets f={f} products={products} />
            </MobileFilters>
            <span className="count" aria-live="polite">
              {list.length} {list.length === 1 ? "cap" : "caps"}
            </span>
            <SortSelect value={f.sort ?? "featured"} hidden={{ q: f.q, team: f.team, style: f.style, size: f.size, stock: f.inStock ? "1" : undefined }} />
          </div>
          {active.length ? (
            <div className="chips" aria-label="Active filters">
              {active.map(([label, key, change]) => (
                <Link key={key} href={href(f, change)} className="chip" aria-label={`Remove filter ${label}`}>
                  {label} <span aria-hidden="true">×</span>
                </Link>
              ))}
              <Link href={f.sort && f.sort !== "featured" ? `/shop?sort=${f.sort}` : "/shop"} className="chip clear">
                Clear all
              </Link>
            </div>
          ) : null}
          {list.length === 0 ? (
            <div className="empty">
              <p>No caps match these filters.</p>
              <Link href="/shop" className="btn ghost">
                See all caps
              </Link>
            </div>
          ) : (
            <div className="pgrid">
              {list.map((p, i) => (
                <ProductCard key={p.id} p={p} currency={s.currency} priority={i < 2} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
