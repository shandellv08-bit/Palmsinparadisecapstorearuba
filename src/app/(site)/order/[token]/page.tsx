import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMode } from "@/lib/config";
import { supabasePublic } from "@/lib/supabase/public";
import { demoReceipts, type Receipt } from "@/lib/demo/receipts";
import { formatMoney, formatOrderNumber, orNotSet, STATUS_LABELS, type OrderStatus } from "@/lib/engine";
import { getSettings } from "@/lib/catalog";
import { ClearCart } from "./ClearCart";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string }> };

export default async function Confirmation({ params, searchParams }: Props) {
  const { token } = await params;
  const { placed } = await searchParams;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  let r: Receipt | null = null;
  if (getMode() === "demo") r = demoReceipts.get(token) ?? null;
  else if (getMode() === "live") {
    const { data } = await supabasePublic().rpc("get_order_receipt", { p_token: token });
    r = (data as Receipt | null) ?? null;
  }
  if (!r) notFound();
  const s = await getSettings();
  const label = typeof r.number === "number" ? formatOrderNumber(r.number) : String(r.number);

  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      {placed ? <ClearCart /> : null}
      <h1>Order {label}</h1>
      <p className="success" role="status">
        {placed ? "Thank you. We received your order." : `Status: ${STATUS_LABELS[r.status as OrderStatus] ?? r.status}`}
      </p>
      <p>
        We will contact you to confirm {r.fulfilment === "pickup" ? "when it is ready for pickup" : "the delivery time"} and how to pay.
        Keep this page for your records.
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Cap</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((i, n) => (
              <tr key={n}>
                <td>
                  {i.name}
                  <div className="small muted">Size {i.size}</div>
                </td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatMoney(i.unit_price_cents * i.quantity, r.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <span>Subtotal</span>
          <span className="num">{formatMoney(r.subtotal_cents, r.currency)}</span>
          {r.fulfilment === "delivery" ? (
            <>
              <span>Delivery</span>
              <span className="num">{formatMoney(r.delivery_fee_cents, r.currency)}</span>
            </>
          ) : null}
          <span className="grand">Total</span>
          <span className="grand num">{formatMoney(r.total_cents, r.currency)}</span>
        </div>
      </div>
      {r.fulfilment === "pickup" ? (
        <div className="section">
          <h2>Pickup</h2>
          <p className="prose">{s.pickup_instructions ?? `Address: ${orNotSet(s.address)}`}</p>
          <p>Opening hours: {orNotSet(s.opening_hours)}</p>
        </div>
      ) : null}
      <p>
        Questions? <Link href="/contact">Contact us</Link> and mention {label}.
      </p>
    </div>
  );
}
