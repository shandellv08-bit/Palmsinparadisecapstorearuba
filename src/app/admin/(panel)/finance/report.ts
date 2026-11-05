import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { productProfitability, type SaleLine } from "@/lib/engine";

/** Sales lines for non-cancelled orders in a period, with cost where known. Finance roles only (RLS). */
export async function loadSales(days: number) {
  const sb = await supabaseServer();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await sb
    .from("order_items")
    .select("product_id, product_name, quantity, unit_price_cents, order_item_costs(unit_cost_cents), orders!inner(status, created_at)")
    .neq("orders.status", "cancelled")
    .gte("orders.created_at", since)
    .limit(10000);
  if (error) throw new Error("Could not load sales");
  const lines: SaleLine[] = ((data ?? []) as unknown as {
    product_id: string | null; product_name: string; quantity: number; unit_price_cents: number; order_item_costs: { unit_cost_cents: number } | null;
  }[]).map((r) => ({
    productKey: r.product_id ?? r.product_name,
    productName: r.product_name,
    quantity: r.quantity,
    unitPriceCents: r.unit_price_cents,
    unitCostCents: r.order_item_costs?.unit_cost_cents ?? null,
  }));
  return productProfitability(lines);
}
