import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { canCancel, formatMoney, formatOrderNumber, nextStatuses, roleCan, STATUS_LABELS } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { cancelOrder, setOrderStatus, setPayment } from "../../../manage";
import { loadOrder } from "./data";

export const metadata = { title: "Order" };

const EVENT_LABELS: Record<string, string> = {
  placed: "Order placed on the website",
  cancelled: "Cancelled (stock not returned)",
  "cancelled:restocked": "Cancelled and stock returned",
};
const eventLabel = (k: string) =>
  EVENT_LABELS[k] ?? (k.startsWith("status:") ? `Marked ${k.slice(7)}` : k.startsWith("payment:") ? `Payment: ${k.slice(8)}` : k);

const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "medium", timeStyle: "short" });

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders");
  const o = await loadOrder((await params).id);
  if (!o) notFound();
  const sb = await supabaseServer();
  const { data: team } = await sb.from("staff").select("user_id, full_name");
  const names = new Map((team ?? []).map((t) => [t.user_id, t.full_name]));
  const label = formatOrderNumber(o.number);

  return (
    <>
      <p className="small">
        <Link href="/admin/orders">Orders</Link> / {label}
      </p>
      <div className="spread">
        <h1>{label}</h1>
        <Link className="btn ghost small" href={`/admin/orders/${o.id}/slip`} target="_blank">
          Print pack slip
        </Link>
      </div>
      <p className="row">
        <span className={`tag ${o.status === "cancelled" ? "bad" : ""}`}>{STATUS_LABELS[o.status]}</span>
        <span className={`tag ${o.payment_status === "paid" ? "ok" : "warn"}`}>{o.payment_status}</span>
        <span className="tag">{o.fulfilment}</span>
        <span className="small muted">{when(o.created_at)}</span>
      </p>

      <div className="two-col wide-left">
        <section>
          <h2>Items</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cap</th>
                  <th>Size</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                </tr>
              </thead>
              <tbody>
                {o.order_items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.product_id ? <Link href={`/admin/products/${i.product_id}`}>{i.product_name}</Link> : i.product_name}</td>
                    <td>{i.size}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{formatMoney(i.unit_price_cents * i.quantity, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <span>Subtotal</span>
            <span className="num">{formatMoney(o.subtotal_cents, o.currency)}</span>
            {o.fulfilment === "delivery" ? (
              <>
                <span>Delivery</span>
                <span className="num">{formatMoney(o.delivery_fee_cents, o.currency)}</span>
              </>
            ) : null}
            <span className="grand">Total</span>
            <span className="grand num">{formatMoney(o.total_cents, o.currency)}</span>
          </div>

          <h2>Timeline</h2>
          <ol className="timeline">
            {o.order_events.map((e) => (
              <li key={e.id}>
                <strong>{eventLabel(e.kind)}</strong>
                <div className="small muted">
                  {when(e.created_at)}
                  {e.actor ? ` · ${names.get(e.actor) ?? "staff"}` : ""}
                </div>
                {e.note ? <div className="small">{e.note}</div> : null}
              </li>
            ))}
          </ol>
        </section>

        <aside className="stack">
          <section className="panel">
            <h2>Customer</h2>
            {o.customers ? (
              <>
                <p>
                  <strong>{o.customers.name}</strong>
                  <br />
                  {o.customers.phone ? <a href={`tel:${o.customers.phone.replace(/[^\d+]/g, "")}`}>{o.customers.phone}</a> : null}
                  {o.customers.email ? (
                    <>
                      <br />
                      <a href={`mailto:${o.customers.email}`}>{o.customers.email}</a>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <p className="muted">Customer record removed.</p>
            )}
            {o.delivery_address ? (
              <p>
                <strong>Deliver to</strong>
                <br />
                <span className="prose">{o.delivery_address}</span>
              </p>
            ) : null}
            {o.customer_note ? (
              <p>
                <strong>Note</strong>
                <br />
                <span className="prose">{o.customer_note}</span>
              </p>
            ) : null}
          </section>

          {nextStatuses(o.status).length ? (
            <section className="panel">
              <h2>Next step</h2>
              <ActionForm action={setOrderStatus}>
                <input type="hidden" name="orderId" value={o.id} />
                <div className="field">
                  <label htmlFor="st-note">Note (optional)</label>
                  <input id="st-note" name="note" type="text" maxLength={500} />
                </div>
                <div className="row">
                  {nextStatuses(o.status).map((s) => (
                    <button key={s} className="btn small" name="status" value={s}>
                      Mark {STATUS_LABELS[s].toLowerCase()}
                    </button>
                  ))}
                </div>
              </ActionForm>
            </section>
          ) : null}

          <section className="panel">
            <h2>Payment</h2>
            <ActionForm action={setPayment}>
              <input type="hidden" name="orderId" value={o.id} />
              <div className="row">
                {o.payment_status !== "paid" && o.payment_status !== "refunded" ? (
                  <button className="btn small" name="status" value="paid">
                    Mark paid
                  </button>
                ) : null}
                {o.payment_status === "paid" ? (
                  <button className="btn ghost small" name="status" value="unpaid">
                    Mark unpaid
                  </button>
                ) : null}
                {o.payment_status === "paid" && roleCan(staff.role, "finance") ? (
                  <button className="btn ghost small" name="status" value="refunded">
                    Mark refunded
                  </button>
                ) : null}
              </div>
            </ActionForm>
          </section>

          {canCancel(o.status) ? (
            <section className="panel">
              <h2>Cancel order</h2>
              <ActionForm action={cancelOrder} confirm={`Cancel ${label}? This cannot be undone.`}>
                <input type="hidden" name="orderId" value={o.id} />
                <label className="choice">
                  <input type="checkbox" name="restock" defaultChecked /> Put the caps back in stock
                </label>
                <div className="field">
                  <label htmlFor="reason">Reason</label>
                  <input id="reason" name="reason" type="text" maxLength={500} />
                </div>
                <button className="btn danger small">Cancel order</button>
              </ActionForm>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
