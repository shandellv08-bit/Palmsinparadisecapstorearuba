import type { CatalogProduct } from "./engine";

/** Styles and teams for the menus, from real products only, most stocked first. */
export function navFacets(products: CatalogProduct[]) {
  const count = (key: (p: CatalogProduct) => string | null) => {
    const m = new Map<string, number>();
    for (const p of products) {
      const k = key(p);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count }));
  };
  return {
    styles: count((p) => p.style).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    teams: count((p) => p.team).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
