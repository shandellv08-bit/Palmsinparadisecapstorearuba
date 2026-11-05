export type StockLevel = "sold_out" | "low" | "in_stock";

export function stockLevel(stock: number, lowThreshold: number): StockLevel {
  if (stock <= 0) return "sold_out";
  if (stock <= lowThreshold) return "low";
  return "in_stock";
}

/** Total stock across sizes and whether anything is buyable. */
export function summariseStock(variants: { stock: number }[]): { total: number; soldOut: boolean } {
  const total = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
  return { total, soldOut: total === 0 };
}
