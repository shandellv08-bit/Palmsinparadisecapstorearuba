import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatOrderNumber, isLead, STATUS_LABELS, type OrderStatus } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { anonymiseCustomer, mergeCustomers, saveCustomer } from "../../../ops";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff("customers");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data: c }, { data: s }] = await Promise.all([
    sb.from("customers").select("*, orders(id, number, status, payment_status, total_cents, currency, created_at, order_items(product_name, size, quantity))").eq("id", id).maybeSingle(),
    sb.from("settings").select("currency").eq("id", 1).single(),
  ]);
  if (!c) notFound();
  const orders = ((c.orders ?? []) as { id: string; number: number; status: OrderStatus; payment_status: string; total_cents: number; currency: string | null; created_at: string; order_items: { product_name: string; size: string; quantity: number }[] }[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const valid = orders.filter((o) => o.status !== "cancelled");
  const spent = valid.reduce((n, o) => n + o.total_cents, 0);
  const sizes = [...new Set(valid.flatMap((o) => o.order_items.map((i) => i.size)))];
  const lead = isLead(me.role);
  const { data: others } = lead ? await sb.from("customers").select("id, name, phone").neq("id", id).is("anonymised_at", null).order("name").limit(500) : { data: [] };

  return (
    <>
      <p className="small"><Link href="/admin/customers">Customers</Link> / {c.name}</p>
      <div className="spread">
        <h1>{c.name}</h1>
        {c.status === "blocked" ? <span className="tag bad">blocked</span> : null}
      </div>
      <p>
        {c.phone ? <a href={`tel:${String(c.phone).replace(/[^\d+]/g, "")}`}>{c.phone}</a> : "No phone"}
        {c.email ? <> · <a href={`mailto:${c.email}`}>{c.email}</a></> : null}
        <span className="muted"> · customer since {new Date(c.created_at).toLocaleDateString("en-GB", { timeZone: "America/Aruba" })}</span>
      </p>
      <div className="stats">
        <div className="stat">Orders<b>{valid.length}</b></div>
        <div className="stat">Spent<b>{formatMoney(spent, s?.currency ?? null)}</b></div>
        <div className="stat">Sizes bought<b style={{ fontSize: "1.1rem" }}>{sizes.join(", ") || "—"}</b></div>
      </div>

      <div className="two-col wide-left">
        <section>
          <h2>Orders</h2>
          {orders.length === 0 ? <p className="muted">No orders.</p> : (
            <ul className="list-plain panel">
              {orders.map((o) => (
                <li key={o.id}>
                  <span>
                    <Link href={`/admin/orders/${o.id}`}>{formatOrderNumber(o.number)}</Link>
                    <span className="small muted"> · {o.order_items.map((i) => `${i.quantity}× ${i.product_name} (${i.size})`).join(", ")}</span>
                  </span>
                  <span className="small">
                    <span className={`tag ${o.status === "cancelled" ? "bad" : ""}`}>{STATUS_LABELS[o.status]}</span> {formatMoney(o.total_cents, o.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="stack">
          <ActionForm action={saveCustomer} className="panel">
            <input type="hidden" name="id" value={c.id} />
            <div className="field">
              <label htmlFor="notes">Private notes</label>
              <textarea id="notes" name="notes" maxLength={4000} defaultValue={c.notes ?? ""} placeholder="e.g. prefers WhatsApp, collects on Saturdays" />
              <p className="hint">Staff only. Write only what you would be comfortable with the customer reading.</p>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={c.status} style={{ width: "auto" }}>
                <option value="active">Active</option>
                <option value="blocked">Blocked (no-shows, abuse)</option>
              </select>
            </div>
            <button className="btn small">Save</button>
          </ActionForm>
          {lead ? (
            <>
              <ActionForm action={mergeCustomers} className="panel" confirm="Merge these two customers? This cannot be undone.">
                <input type="hidden" name="keep" value={c.id} />
                <div className="field">
                  <label htmlFor="remove">Same person as</label>
                  <select id="remove" name="remove" required>
                    <option value="">Choose a customer…</option>
                    {((others ?? []) as { id: string; name: string; phone: string | null }[]).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}{o.phone ? ` · ${o.phone}` : ""}</option>
                    ))}
                  </select>
                  <p className="hint">Their orders move here and their record is removed. Use when one person ordered with two numbers.</p>
                </div>
                <button className="btn ghost small">Merge into this customer</button>
              </ActionForm>
              <ActionForm action={anonymiseCustomer} className="panel" confirm="Remove this person's name, phone, email and notes for good? Their orders stay for your records.">
                <input type="hidden" name="id" value={c.id} />
                <h2 style={{ fontSize: "1rem" }}>Privacy request</h2>
                <p className="small">If this person asks to be forgotten: removes name, phone, email, notes and delivery addresses. Orders and totals stay for bookkeeping.</p>
                <button className="btn danger small">Forget this customer</button>
              </ActionForm>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
