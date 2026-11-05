import "server-only";

/** Demo-mode receipts, kept in memory only. Lost on restart, which is the point. */
export interface Receipt {
  number: number | string;
  status: string;
  payment_status: string;
  fulfilment: "pickup" | "delivery";
  currency: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  created_at: string;
  items: { name: string; size: string; quantity: number; unit_price_cents: number }[];
}

const g = globalThis as unknown as { __pipDemoReceipts?: Map<string, Receipt> };
export const demoReceipts: Map<string, Receipt> = (g.__pipDemoReceipts ??= new Map());
