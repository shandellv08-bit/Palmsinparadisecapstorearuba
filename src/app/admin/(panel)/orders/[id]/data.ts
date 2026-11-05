import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { OrderStatus, PaymentStatus } from "@/lib/engine";

export interface OrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfilment: "pickup" | "delivery";
  delivery_address: string | null;
  customer_note: string | null;
  currency: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  created_at: string;
  customers: { id: string; name: string; phone: string | null; email: string | null } | null;
  order_items: { id: string; product_id: string | null; product_name: string; size: string; unit_price_cents: number; quantity: number }[];
  order_events: { id: number; kind: string; note: string | null; created_at: string; actor: string | null }[];
}

export async function loadOrder(id: string): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("orders")
    .select("*, customers(id, name, phone, email), order_items(id, product_id, product_name, size, unit_price_cents, quantity), order_events(id, kind, note, created_at, actor)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const o = data as unknown as OrderDetail;
  o.order_events.sort((a, b) => a.id - b.id);
  o.order_items.sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size.localeCompare(b.size));
  return o;
}
