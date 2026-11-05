import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatOrderNumber, readiness, roleCan, STATUS_LABELS, type OrderStatus } from "@/lib/engine";
import { SETTINGS_COLUMNS, type Settings } from "@/lib/settings";

export default async function Overview() {
  const staff = await requireStaff("dashboard");
  const sb = await supabaseServer();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [settingsRes, openRes, weekRes, messagesRes, lowRes, activeRes] = await Promise.all([
    sb.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single(),
    roleCan(staff.role, "orders")
      ? sb.from("orders").select("id, number, status, total_cents, currency, fulfilment, created_at").in("status", ["new", "confirmed", "ready"]).order("created_at").limit(20)
      : Promise.resolve({ data: [] }),
    roleCan(staff.role, "orders")
      ? sb.from("orders").select("total_cents").neq("status", "cancelled").gte("created_at", since)
      : Promise.resolve({ data: [] }),
    roleCan(staff.role, "messages")
      ? sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new")
      : Promise.resolve({ count: 0 }),
    roleCan(staff.role, "inventory")
      ? sb.from("product_variants").select("id, size, stock, products!inner(id, name, status)").eq("products.status", "active").order("stock").limit(200)
      : Promise.resolve({ data: [] }),
    sb.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const s = settingsRes.data as unknown as Settings;
  const open = (openRes.data ?? []) as { id: string; number: number; status: OrderStatus; total_cents: number; currency: string | null; fulfilment: string; created_at: string }[];
  const week = (weekRes.data ?? []) as { total_cents: number }[];
  const low = ((lowRes.data ?? []) as unknown as { id: string; size: string; stock: number; products: { id: string; name: string } }[]).filter(
    (v) => v.stock <= (s?.low_stock_threshold ?? 2),
  );
  const checklist = s && roleCan(staff.role, "settings") ? readiness(s, activeRes.count ?? 0) : [];
  const missing = checklist.filter((c) => !c.done);

  return (
    <>
      <h1>Overview</h1>
      <div className="stats">
        {roleCan(staff.role, "orders") ? (
          <>
            <div className="stat">
              Open orders<b>{open.length}</b>
            </div>
            <div className="stat">
              Orders, last 7 days<b>{week.length}</b>
            </div>
          </>
        ) : null}
        {roleCan(staff.role, "finance") ? (
          <div className="stat">
            Sales, last 7 days<b>{formatMoney(week.reduce((n, o) => n + o.total_cents, 0), s?.currency)}</b>
          </div>
        ) : null}
        {roleCan(staff.role, "messages") ? (
          <div className="stat">
            New messages<b>{messagesRes.count ?? 0}</b>
          </div>
        ) : null}
        {roleCan(staff.role, "inventory") ? (
          <div className="stat">
            Sizes low or sold out<b>{low.length}</b>
          </div>
        ) : null}
      </div>

      {missing.length ? (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Before you go live</h2>
          <p className="muted">These are not set yet. The store shows &quot;not set&quot; until you fill them in.</p>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.key}>
                {c.done ? "✓" : "○"} {c.label}
              </li>
            ))}
          </ul>
          <Link href="/admin/settings">Open store settings</Link>
        </section>
      ) : null}

      {roleCan(staff.role, "orders") ? (
        <section className="section">
          <h2>Open orders</h2>
          {open.length === 0 ? (
            <p className="muted">No open orders.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/orders/${o.id}`}>{formatOrderNumber(o.number)}</Link>
                        <div className="small muted">{new Date(o.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba" })}</div>
                      </td>
                      <td>{STATUS_LABELS[o.status]}</td>
                      <td>{o.fulfilment}</td>
                      <td className="num">{formatMoney(o.total_cents, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {roleCan(staff.role, "inventory") && low.length ? (
        <section className="section">
          <h2>Low or sold out</h2>
          <ul>
            {low.slice(0, 20).map((v) => (
              <li key={v.id}>
                <Link href={`/admin/products/${v.products.id}`}>{v.products.name}</Link>, size {v.size}:{" "}
                {v.stock === 0 ? <span className="tag bad">sold out</span> : <span className="tag warn">{v.stock} left</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
