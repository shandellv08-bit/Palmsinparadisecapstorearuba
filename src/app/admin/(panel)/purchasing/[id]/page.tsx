import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, sortSizes } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { addPoLine, receivePoItem, removePoLine, setPoStatus, updatePurchaseOrder } from "../../../ops";

export const metadata = { title: "Purchase order" };

const plain = (c: number) => (c / 100).toFixed(2);

export default async function PurchaseOrder({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("purchasing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data: po }, { data: variants }, { data: s }] = await Promise.all([
    sb.from("purchase_orders").select("*, suppliers(id, name, lead_time_days), purchase_order_items(id, variant_id, quantity_ordered, quantity_received, unit_cost_cents, product_variants(size, products(name)))").eq("id", id).maybeSingle(),
    sb.from("product_variants").select("id, size, stock, products!inner(name, status)").neq("products.status", "archived").limit(2000),
    sb.from("settings").select("currency").eq("id", 1).single(),
  ]);
  if (!po) notFound();
  const cur = s?.currency ?? null;
  type Item = { id: string; variant_id: string; quantity_ordered: number; quantity_received: number; unit_cost_cents: number | null; product_variants: { size: string; products: { name: string } } };
  const items = ((po.purchase_order_items ?? []) as Item[]).sort((a, b) => a.product_variants.products.name.localeCompare(b.product_variants.products.name));
  const draft = po.status === "draft";
  const receiving = po.status === "ordered" || po.status === "partly_received";
  const subtotal = items.reduce((n, i) => n + (i.unit_cost_cents ?? 0) * i.quantity_ordered, 0);
  const options = ((variants ?? []) as unknown as { id: string; size: string; stock: number; products: { name: string } }[])
    .filter((v) => !items.some((i) => i.variant_id === v.id))
    .sort((a, b) => a.products.name.localeCompare(b.products.name) || sortSizes([a.size, b.size]).indexOf(a.size) - sortSizes([a.size, b.size]).indexOf(b.size));
  const suggested = po.suppliers?.lead_time_days != null && po.ordered_on
    ? new Date(Date.parse(po.ordered_on) + po.suppliers.lead_time_days * 864e5).toISOString().slice(0, 10)
    : null;

  return (
    <>
      <p className="small"><Link href="/admin/purchasing">Purchasing</Link> / PO-{po.number}</p>
      <div className="spread">
        <h1>PO-{po.number}</h1>
        <span className="tag">{String(po.status).replace("_", " ")}</span>
      </div>
      <p className="muted">
        Supplier: {po.suppliers ? <Link href={`/admin/purchasing/suppliers/${po.suppliers.id}`}>{po.suppliers.name}</Link> : "not set"}
        {po.ordered_on ? ` · ordered ${po.ordered_on}` : ""}
        {po.expected_on ? ` · expected ${po.expected_on}` : suggested ? ` · expected around ${suggested} (from lead time)` : ""}
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cap</th>
              <th>Size</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th className="num">Unit cost</th>
              <th>{receiving ? "Receive" : draft ? "" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.product_variants.products.name}</td>
                <td>{i.product_variants.size}</td>
                <td className="num">{i.quantity_ordered}</td>
                <td className="num">{i.quantity_received}</td>
                <td className="num">{i.unit_cost_cents !== null ? formatMoney(i.unit_cost_cents, cur) : <span className="muted">not set</span>}</td>
                <td>
                  {draft ? (
                    <ActionForm action={removePoLine}>
                      <input type="hidden" name="po" value={po.id} />
                      <input type="hidden" name="item" value={i.id} />
                      <button className="linkbtn small">Remove</button>
                    </ActionForm>
                  ) : receiving && i.quantity_received < i.quantity_ordered ? (
                    <ActionForm action={receivePoItem} className="row">
                      <input type="hidden" name="item" value={i.id} />
                      <label className="sr-only" htmlFor={`r${i.id}`}>How many arrived</label>
                      <input id={`r${i.id}`} name="qty" type="number" min={1} max={i.quantity_ordered - i.quantity_received} defaultValue={i.quantity_ordered - i.quantity_received} style={{ width: "5.5rem" }} />
                      <button className="btn small">Receive</button>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals" style={{ maxWidth: 360, marginLeft: "auto" }}>
        <span>Caps</span>
        <span className="num">{formatMoney(subtotal, cur)}</span>
        <span>Shipping and fees</span>
        <span className="num">{formatMoney(po.shipping_cents, cur)}</span>
        <span className="grand">Total</span>
        <span className="grand num">{formatMoney(subtotal + po.shipping_cents, cur)}</span>
      </div>

      {draft ? (
        <section className="section">
          <h2>Add caps</h2>
          <ActionForm action={addPoLine} className="row panel" resetOnSuccess>
            <input type="hidden" name="po" value={po.id} />
            <div className="field" style={{ margin: 0, flex: 2, minWidth: 220 }}>
              <label htmlFor="pv">Cap and size</label>
              <select id="pv" name="variant" required>
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.products.name}, {v.size} (in stock: {v.stock})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="pq">Quantity</label>
              <input id="pq" name="qty" type="number" min={1} max={10000} defaultValue={6} style={{ width: "6rem" }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="pc">Unit cost</label>
              <input id="pc" name="cost" type="text" inputMode="decimal" style={{ width: "7rem" }} />
            </div>
            <button className="btn" style={{ alignSelf: "flex-end" }}>Add</button>
          </ActionForm>
          {options.length === 0 ? <p className="small muted">Every size is on this order, or there are no products yet.</p> : null}
        </section>
      ) : null}

      <section className="section two-col">
        <ActionForm action={updatePurchaseOrder} className="panel">
          <input type="hidden" name="id" value={po.id} />
          <div className="field">
            <label htmlFor="exp">Expected arrival</label>
            <input id="exp" name="expected" type="date" defaultValue={po.expected_on ?? ""} style={{ width: "auto", minHeight: 46 }} />
          </div>
          <div className="field">
            <label htmlFor="ship">Shipping, duties and fees</label>
            <input id="ship" name="shipping" type="text" inputMode="decimal" defaultValue={plain(po.shipping_cents)} />
          </div>
          <div className="field">
            <label htmlFor="pnotes">Notes</label>
            <textarea id="pnotes" name="notes" maxLength={4000} defaultValue={po.notes ?? ""} />
          </div>
          <button className="btn small">Save</button>
        </ActionForm>
        <div className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Status</h2>
          <ActionForm action={setPoStatus} className="row" confirm="Change the status of this purchase order?">
            <input type="hidden" name="po" value={po.id} />
            {draft ? <button className="btn small" name="status" value="ordered">Mark as ordered</button> : null}
            {draft || receiving ? <button className="btn ghost small" name="status" value="cancelled">Cancel order</button> : null}
          </ActionForm>
          <p className="small muted" style={{ marginTop: ".75rem" }}>
            Draft: edit freely. Ordered: lines are locked and the delivery shows up for whoever receives stock. Receiving adds the caps to stock and logs it against this order.
          </p>
        </div>
      </section>
    </>
  );
}
