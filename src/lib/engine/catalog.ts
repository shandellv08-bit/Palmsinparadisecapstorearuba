/** Shop filtering and sorting. Pure, so it is tested and works the same for demo and live data. */

export interface CatalogVariant {
  id: string;
  size: string;
  in_stock: boolean;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  team: string | null;
  style: string | null;
  colour: string | null;
  description: string | null;
  price_cents: number;
  featured: boolean;
  images: string[];
  variants: CatalogVariant[];
  in_stock: boolean;
  created_at: string;
}

export const SORTS = ["featured", "newest", "price-asc", "price-desc"] as const;
export type Sort = (typeof SORTS)[number];

export interface CatalogFilter {
  q?: string;
  team?: string;
  style?: string;
  size?: string;
  inStock?: boolean;
  sort?: Sort;
}

export function parseFilter(params: Record<string, string | string[] | undefined>): CatalogFilter {
  const one = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() !== "" ? s.trim().slice(0, 80) : undefined;
  };
  const sort = one("sort");
  return {
    q: one("q"),
    team: one("team"),
    style: one("style"),
    size: one("size"),
    inStock: one("stock") === "1",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Sort) : "featured",
  };
}

export function filterProducts(products: CatalogProduct[], f: CatalogFilter): CatalogProduct[] {
  const q = f.q?.toLowerCase();
  const out = products.filter((p) => {
    if (f.team && p.team !== f.team) return false;
    if (f.style && p.style !== f.style) return false;
    if (f.size && !p.variants.some((v) => v.size === f.size && (!f.inStock || v.in_stock))) return false;
    if (f.inStock && !p.in_stock) return false;
    if (q && ![p.name, p.team, p.style, p.colour].some((t) => t?.toLowerCase().includes(q))) return false;
    return true;
  });
  const byName = (a: CatalogProduct, b: CatalogProduct) => a.name.localeCompare(b.name);
  switch (f.sort ?? "featured") {
    case "newest":
      return out.sort((a, b) => b.created_at.localeCompare(a.created_at) || byName(a, b));
    case "price-asc":
      return out.sort((a, b) => a.price_cents - b.price_cents || byName(a, b));
    case "price-desc":
      return out.sort((a, b) => b.price_cents - a.price_cents || byName(a, b));
    default:
      // featured first, then in stock, then name; sold-out caps sink to the end
      return out.sort(
        (a, b) => Number(b.featured) - Number(a.featured) || Number(b.in_stock) - Number(a.in_stock) || byName(a, b),
      );
  }
}

const SIZE_ORDER = (s: string): number => {
  // fitted sizes like "7 1/4" sort numerically; letter sizes after
  const m = s.match(/^(\d+)(?:\s+(\d+)\/(\d+))?$/);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  const letters = ["XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XXL"];
  const i = letters.indexOf(s.toUpperCase());
  return i >= 0 ? 100 + i : 1000;
};

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => SIZE_ORDER(a) - SIZE_ORDER(b) || a.localeCompare(b));
}

/** Values available for the filter dropdowns. */
export function facets(products: CatalogProduct[]) {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    teams: uniq(products.map((p) => p.team)).sort(),
    styles: uniq(products.map((p) => p.style)).sort(),
    sizes: sortSizes(uniq(products.flatMap((p) => p.variants.map((v) => v.size)))),
  };
}
