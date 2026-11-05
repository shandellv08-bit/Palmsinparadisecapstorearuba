/** Profitability per product. Lines with unknown cost are counted in revenue but not in margin. */

export interface SaleLine {
  productKey: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
}

export interface ProductProfit {
  productKey: string;
  productName: string;
  unitsSold: number;
  revenueCents: number;
  costedRevenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number | null; // null when no line had a known cost
  unitsWithoutCost: number;
}

export function productProfitability(lines: SaleLine[]): { rows: ProductProfit[]; totals: ProductProfit } {
  const map = new Map<string, ProductProfit>();
  const blank = (key: string, name: string): ProductProfit => ({
    productKey: key, productName: name, unitsSold: 0, revenueCents: 0, costedRevenueCents: 0, costCents: 0, marginCents: 0, marginPct: null, unitsWithoutCost: 0,
  });
  const add = (p: ProductProfit, l: SaleLine) => {
    const revenue = l.unitPriceCents * l.quantity;
    p.unitsSold += l.quantity;
    p.revenueCents += revenue;
    if (l.unitCostCents === null) p.unitsWithoutCost += l.quantity;
    else {
      p.costedRevenueCents += revenue;
      p.costCents += l.unitCostCents * l.quantity;
    }
  };
  const totals = blank("total", "Total");
  for (const l of lines) {
    const p = map.get(l.productKey) ?? blank(l.productKey, l.productName);
    add(p, l);
    add(totals, l);
    map.set(l.productKey, p);
  }
  const finish = (p: ProductProfit) => {
    p.marginCents = p.costedRevenueCents - p.costCents;
    p.marginPct = p.costedRevenueCents > 0 ? Math.round((p.marginCents / p.costedRevenueCents) * 1000) / 10 : null;
    return p;
  };
  return { rows: [...map.values()].map(finish).sort((a, b) => b.revenueCents - a.revenueCents), totals: finish(totals) };
}

/** CSV with quoting and protection against spreadsheet formula injection. */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
