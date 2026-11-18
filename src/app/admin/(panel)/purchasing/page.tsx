import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { createPurchaseOrder } from "../../ops";
import { SupplierForm, type Supplier } from "./SupplierForm";

export const metadata = { title: "Purchasing" };

const STATUS: Record<string, string> = { draft: "Draft", ordered: "Ordered", partly_received: "Partly received", received: "Received", cancelled: "Cancelled" };

export default async function Purchasing() {
  await requireStaff("purchasing");
  const sb = await supabaseServer();
  const [{ data: sup }, { data: pos }, { data: s }, { data: costs }] = await Promise.all([
    sb.from("suppliers").select("*").order("name"),
    sb.from("purchase_orders").select("id, number, status, supplier_id, ordered_on, expected_on, shipping_cents, purchase_order_items(quantity_ordered, quantity_received, unit_cost_cents)").order("number", { ascending: false }).limit(100),
    sb.from("settings").select("currency").eq("id", 1).single(),
    sb.from("purchase_order_items").select("unit_cost_cents, quantity_ordered, purchase_orders!inner(supplier_id, status)").neq("purchase_orders.status", "cancelled"),
  ]);
  const suppliers = (sup ?? []) as Supplier[];
  const byId = new Map(suppliers.map((x) => [x.id, x.name]));
  const orders = (pos ?? []) as { id: string; number: number; status: string; supplier_id: string | null; ordered_on: string | null; expected_on: string | null; shipping_cents: number; purchase_order_items: { quantity_ordered: number; quantity_received: number; unit_cost_cents: number | null }[] }[];
  const cur = s?.currency ?? null;
  // supplier comparison: average unit cost and number of caps ordered
  const cmp = new Map<string, { units: number; costed: number; cost: number }>();
  for (const r of (costs ?? []) as unknown as { unit_cost_cents: number | null; quantity_ordered: number; purchase_orders: { supplier_id: string | null } }[]) {
    const k = r.purchase_orders.supplier_id;
    if (!k) continue;
    const e = cmp.get(k) ?? { units: 0, costed: 0, cost: 0 };
    e.units += r.quantity_ordered;
    if (r.unit_cost_cents !== null) {
      e.costed += r.quantity_ordered;
      e.cost += r.unit_cost_cents * r.quantity_ordered;
    }
    cmp.set(k, e);
  }

  return (
    <>
      <h1>Purchasing</h1>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="spread">
          <h2>Purchase orders</h2>
        </div>
        <ActionForm action={createPurchaseOrder} className="row panel">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="po-sup">Supplier</label>
            <select id="po-sup" name="supplier" style={{ width: "auto" }}>
              <option value="">Not set</option>
              {suppliers.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="po-exp">Expected</label>
            <input id="po-exp" name="expected" type="date" style={{ width: "auto", minHeight: 46 }} />
          </div>
          <button className="btn" style={{ alignSelf: "flex-end" }}>New purchase order</button>
        </ActionForm>
        {orders.length === 0 ? (
          <p className="empty">No purchase orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className="num">Caps</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const units = o.purchase_order_items.reduce((n, i) => n + i.quantity_ordered, 0);
                  const got = o.purchase_order_items.reduce((n, i) => n + i.quantity_received, 0);
                  const cost = o.purchase_order_items.reduce((n, i) => n + (i.unit_cost_cents ?? 0) * i.quantity_ordered, 0) + o.shipping_cents;
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/purchasing/${o.id}`}>PO-{o.number}</Link>
                        <div className="small muted">{o.expected_on ? `expected ${o.expected_on}` : o.ordered_on ? `ordered ${o.ordered_on}` : ""}</div>
                      </td>
                      <td>{o.supplier_id ? byId.get(o.supplier_id) : <span className="muted">not set</span>}</td>
                      <td><span className={`tag ${o.status === "received" ? "ok" : o.status === "cancelled" ? "bad" : o.status === "draft" ? "" : "warn"}`}>{STATUS[o.status]}</span></td>
                      <td className="num">{got}/{units}</td>
                      <td className="num">{formatMoney(cost, cur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Suppliers</h2>
        {suppliers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="num">Lead time</th>
                  <th className="num">Caps ordered</th>
                  <th className="num">Avg cost per cap</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((x) => {
                  const c = cmp.get(x.id);
                  return (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/admin/purchasing/suppliers/${x.id}`}>{x.name}</Link>
                        <div className="small muted">{[x.contact_name, x.phone, x.email].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="num">{x.lead_time_days !== null ? `${x.lead_time_days} days` : <span className="muted">not set</span>}</td>
                      <td className="num">{c?.units ?? 0}</td>
                      <td className="num">{c && c.costed ? formatMoney(Math.round(c.cost / c.costed), cur) : <span className="muted">no costs yet</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No suppliers yet.</p>
        )}
        <h3 style={{ marginTop: "1.5rem" }}>Add a supplier</h3>
        <SupplierForm />
      </section>
    </>
  );
}
