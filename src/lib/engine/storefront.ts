/** Storefront helpers: fitted size guide, "new" badges, related caps. Pure and tested. */

import type { CatalogProduct } from "./catalog";

/** Parses fitted cap sizes like "7", "7 1/4", "6 7/8". Null for letter sizes or "One size". */
export function fittedSizeValue(size: string): number | null {
  const m = size.trim().match(/^(\d)(?:\s+(\d)\/(\d))?$/);
  if (!m) return null;
  const v = Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  return v >= 6 && v <= 8.5 ? v : null;
}

/**
 * Head circumference for a fitted size. A fitted cap size is the head
 * diameter in inches, so circumference = size x pi. Rounded for display.
 */
export function headCircumference(size: string): { cm: number; inches: number } | null {
  const v = fittedSizeValue(size);
  if (v === null) return null;
  const inches = v * Math.PI;
  return { cm: Math.round(inches * 2.54 * 10) / 10, inches: Math.round(inches * 100) / 100 };
}

/** The usual run of fitted sizes, 6 7/8 to 8, for the size guide. */
export const FITTED_SIZES = ["6 7/8", "7", "7 1/8", "7 1/4", "7 3/8", "7 1/2", "7 5/8", "7 3/4", "7 7/8", "8"];

/** Which fitted size fits a measured head (cm): the smallest size whose circumference is at least the head. */
export function sizeForHead(cm: number): string | null {
  if (!Number.isFinite(cm) || cm <= 0) return null;
  for (const s of FITTED_SIZES) {
    const c = headCircumference(s)!;
    if (c.cm >= cm - 0.05) return s;
  }
  return null;
}

export const NEW_DAYS = 30;

/** "New" means added to the store in the last 30 days. Based only on the real date. */
export function isNew(createdAt: string, now: Date = new Date(), days = NEW_DAYS): boolean {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= days * 864e5;
}

/** Up to n other caps: same team first, then same style; in stock before sold out. */
export function relatedProducts(p: CatalogProduct, all: CatalogProduct[], n = 4): CatalogProduct[] {
  const score = (o: CatalogProduct) => (o.team && o.team === p.team ? 2 : 0) + (o.style && o.style === p.style ? 1 : 0);
  return all
    .filter((o) => o.id !== p.id && score(o) > 0)
    .sort((a, b) => score(b) - score(a) || Number(b.in_stock) - Number(a.in_stock) || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Short availability line for a product card. */
export function availabilityLabel(p: Pick<CatalogProduct, "variants" | "in_stock">): string {
  if (!p.in_stock) return "Sold out";
  const sizes = p.variants.filter((v) => v.in_stock);
  if (sizes.length === 1) return sizes[0].size === "One size" ? "In stock" : `Size ${sizes[0].size} only`;
  return `${sizes.length} sizes in stock`;
}

/** Page title for the shop, from the active filters. */
export function shopTitle(f: { q?: string; team?: string; style?: string; sort?: string }): string {
  if (f.q) return `Search: ${f.q}`;
  if (f.team && f.style) return `${f.team} ${f.style}`;
  if (f.team) return f.team;
  if (f.style) return f.style;
  if (f.sort === "newest") return "New arrivals";
  return "All caps";
}
