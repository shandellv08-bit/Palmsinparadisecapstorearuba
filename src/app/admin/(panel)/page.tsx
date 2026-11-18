import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  arubaDayStart, arubaMonthStart, formatHours, formatMoney, formatOrderNumber, goalProgress, isLead, profitAfterExpenses,
  readiness, roleCan, STATUS_LABELS, type OrderStatus,
} from "@/lib/engine";
import { SETTINGS_COLUMNS, type Settings } from "@/lib/settings";
import { loadSalesSince } from "./finance/report";

export const metadata = { title: "My work" };

const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" });
const today = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);

export default async function MyWork() {
  const me = await requireStaff("dashboard");
  const can = (a: Parameters<typeof roleCan>[1]) => roleCan(me.role, a);
  const lead = isLead(me.role);
  const sb = await supabaseServer();
  const now = new Date();
  const monthStart = arubaMonthStart(now).toISOString();
  const dayStart = arubaDayStart(now).toISOString();
  const none = Promise.resolve({ data: [] as never[], count: 0 });

  const [settingsQ, tasksQ, chatsQ, ordersQ, deliveriesQ, lowQ, notesQ, monthOrdersQ, goalQ, expensesQ, onShiftQ, activeQ] = await Promise.all([
    sb.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single(),
    sb.from("tasks").select("id, title, priority, due_on, status").eq("assigned_to", me.userId).neq("status", "done").order("due_on", { ascending: true, nullsFirst: false }).limit(8),
    can("messages") ? sb.from("conversations").select("id, customer_name, last_message_at, unread_by_staff, needs_human, assigned_to").eq("status", "open").order("last_message_at", { ascending: false }).limit(6) : none,
    can("orders") ? sb.from("orders").select("id, number, status, fulfilment, total_cents, currency, created_at").in("status", ["new", "confirmed", "ready"]).order("created_at").limit(10) : none,
    can("inventory") ? sb.from("incoming_deliveries").select("po_id, po_number, supplier_name, expected_on, quantity_ordered, quantity_received").limit(50) : none,
    can("inventory") ? sb.from("product_variants").select("id, size, stock, products!inner(id, name, status)").eq("products.status", "active").order("stock").limit(100) : none,
    sb.from("notifications").select("id, title, link, created_at").is("read_at", null).order("id", { ascending: false }).limit(5),
    can("finance") ? sb.from("orders").select("total_cents, created_at").neq("status", "cancelled").gte("created_at", monthStart) : none,
    can("finance") ? sb.from("goals").select("monthly_sales_target_cents").eq("id", 1).maybeSingle() : Promise.resolve({ data: null }),
    can("finance") ? sb.from("expenses").select("amount_cents").gte("spent_on", monthStart.slice(0, 10)) : none,
    lead ? sb.from("time_entries").select("user_id, started_at").is("ended_at", null) : none,
    lead ? sb.from("products").select("id", { count: "exact", head: true }).eq("status", "active") : Promise.resolve({ count: 0 }),
  ]);

  const s = settingsQ.data as unknown as Settings;
  const cur = s?.currency ?? null;
  const tasks = (tasksQ.data ?? []) as { id: string; title: string; priority: string; due_on: string | null; status: string }[];
  const chats = (chatsQ.data ?? []) as { id: string; customer_name: string; last_message_at: string; unread_by_staff: boolean; assigned_to: string | null }[];
  const orders = (ordersQ.data ?? []) as { id: string; number: number; status: OrderStatus; fulfilment: string; total_cents: number; currency: string | null; created_at: string }[];
  const deliveries = Object.values(
    ((deliveriesQ.data ?? []) as { po_id: string; po_number: number; supplier_name: string | null; expected_on: string | null; quantity_ordered: number; quantity_received: number }[]).reduce(
      (m, r) => {
        const e = (m[r.po_id] ??= { ...r, left: 0 });
        e.left += r.quantity_ordered - r.quantity_received;
        return m;
      },
      {} as Record<string, { po_id: string; po_number: number; supplier_name: string | null; expected_on: string | null; left: number }>,
    ),
  );
  const low = ((lowQ.data ?? []) as unknown as { id: string; size: string; stock: number; products: { id: string; name: string } }[]).filter((v) => v.stock <= (s?.low_stock_threshold ?? 2));
  const notes = (notesQ.data ?? []) as { id: number; title: string; link: string | null; created_at: string }[];

  let pulse: React.ReactNode = null;
  if (can("finance")) {
    const monthOrders = (monthOrdersQ.data ?? []) as { total_cents: number; created_at: string }[];
    const monthSales = monthOrders.reduce((n, o) => n + o.total_cents, 0);
    const todaySales = monthOrders.filter((o) => o.created_at >= dayStart).reduce((n, o) => n + o.total_cents, 0);
    const target = (goalQ.data as { monthly_sales_target_cents: number | null } | null)?.monthly_sales_target_cents ?? null;
    const g = goalProgress(monthSales, target, now);
    const expenses = ((expensesQ.data ?? []) as { amount_cents: number }[]).reduce((n, e) => n + e.amount_cents, 0);
    const margin = await loadSalesSince(arubaMonthStart(now));
    const profit = profitAfterExpenses(margin.totals.marginCents, expenses);
    pulse = (
      <section aria-labelledby="pulse-h" style={{ marginBottom: "1.5rem" }}>
        <h2 id="pulse-h" className="sr-only">Business pulse</h2>
        <div className="stats">
          <div className="stat">Sales today<b>{formatMoney(todaySales, cur)}</b></div>
          <div className="stat">
            Sales this month<b>{formatMoney(monthSales, cur)}</b>
            {target ? <span className="small muted">Goal {formatMoney(target, cur)}</span> : <Link className="small" href="/admin/finance#goal">Set a monthly goal</Link>}
          </div>
          <div className="stat">
            Profit this month<b>{formatMoney(profit, cur)}</b>
            <span className="small muted">Margin {formatMoney(margin.totals.marginCents, cur)} − expenses {formatMoney(expenses, cur)}</span>
          </div>
          <div className="stat">Open orders<b>{orders.length}</b></div>
        </div>
        {target ? (
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <div className="spread small">
              <strong>Monthly goal: {g.pct}%</strong>
              <span className="muted">
                {g.expectedPct}% of the month has passed. At this pace: {formatMoney(g.projectedCents, cur)} ({g.onTrack ? "on track" : "behind"}).
              </span>
            </div>
            <div className="progress" role="img" aria-label={`${g.pct}% of the monthly goal reached, ${g.expectedPct}% of the month passed`} style={{ marginTop: ".5rem" }}>
              <span style={{ width: `${Math.min(100, g.pct ?? 0)}%`, background: g.onTrack ? "var(--ok)" : "var(--sea)" }} />
              <i style={{ left: `${g.expectedPct}%` }} />
            </div>
          </div>
        ) : null}
        {margin.totals.unitsWithoutCost ? (
          <p className="small muted">{margin.totals.unitsWithoutCost} caps sold this month have no cost entered, so profit is higher than real. Add costs on the products.</p>
        ) : null}
      </section>
    );
  }

  const team = lead ? await sb.from("staff").select("user_id, full_name").eq("active", true) : { data: [] };
  const names = new Map(((team.data ?? []) as { user_id: string; full_name: string }[]).map((t) => [t.user_id, t.full_name]));
  const onShift = (onShiftQ.data ?? []) as { user_id: string; started_at: string }[];
  const checklist = s && can("settings") ? readiness(s, activeQ.count ?? 0) : [];

  return (
    <>
      <h1>Hi {me.fullName.split(" ")[0]}</h1>
      {pulse}
      {checklist.some((c) => !c.done) ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>Before you go live</h2>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.key}>{c.done ? "✓" : "○"} {c.label}</li>
            ))}
          </ul>
          <Link href="/admin/settings">Open store settings</Link>
        </section>
      ) : null}
      <div className="work-grid">
        <section className="panel">
          <h2>
            My tasks <Link href="/admin/tasks">All tasks</Link>
          </h2>
          {tasks.length === 0 ? (
            <p className="muted">Nothing assigned to you.</p>
          ) : (
            <ul className="list-plain">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tasks/${t.id}`}>{t.title}</Link>
                  <span className="small">
                    {t.priority === "high" ? <span className="tag bad">high</span> : null}{" "}
                    {t.due_on ? <span className={t.due_on < today() ? "error" : "muted"}>due {t.due_on}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {can("messages") ? (
          <section className="panel">
            <h2>
              Chats <Link href="/admin/inbox">Inbox</Link>
            </h2>
            {chats.length === 0 ? (
              <p className="muted">No open chats.</p>
            ) : (
              <ul className="list-plain">
                {chats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/inbox/${c.id}`}>
                      {c.unread_by_staff ? <strong>{c.customer_name}</strong> : c.customer_name}
                    </Link>
                    <span className="small muted">
                      {c.unread_by_staff ? <span className="tag warn">waiting</span> : null} {when(c.last_message_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {can("orders") ? (
          <section className="panel">
            <h2>
              Orders to handle <Link href="/admin/orders">All orders</Link>
            </h2>
            {orders.length === 0 ? (
              <p className="muted">No open orders.</p>
            ) : (
              <ul className="list-plain">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`}>{formatOrderNumber(o.number)}</Link>
                    <span className="small">
                      <span className="tag">{STATUS_LABELS[o.status]}</span> {o.fulfilment} · {formatMoney(o.total_cents, o.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {can("inventory") ? (
          <section className="panel">
            <h2>
              Stock <Link href="/admin/inventory">Stock &amp; deliveries</Link>
            </h2>
            {deliveries.length ? (
              <>
                <p className="small"><strong>Deliveries to receive</strong></p>
                <ul className="list-plain">
                  {deliveries.map((d) => (
                    <li key={d.po_id}>
                      <Link href="/admin/inventory#incoming">PO-{d.po_number}{d.supplier_name ? ` · ${d.supplier_name}` : ""}</Link>
                      <span className="small muted">{d.left} caps{d.expected_on ? ` · expected ${d.expected_on}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {low.length ? (
              <>
                <p className="small" style={{ marginTop: ".75rem" }}><strong>Low or sold out</strong></p>
                <ul className="list-plain">
                  {low.slice(0, 8).map((v) => (
                    <li key={v.id}>
                      <Link href={`/admin/products/${v.products.id}`}>{v.products.name}, {v.size}</Link>
                      {v.stock === 0 ? <span className="tag bad">sold out</span> : <span className="tag warn">{v.stock} left</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {!deliveries.length && !low.length ? <p className="muted">Stock is fine and no deliveries are expected.</p> : null}
          </section>
        ) : null}

        {lead ? (
          <section className="panel">
            <h2>
              Team now <Link href="/admin/hours">Hours</Link>
            </h2>
            {onShift.length === 0 ? (
              <p className="muted">Nobody is clocked in.</p>
            ) : (
              <ul className="list-plain">
                {onShift.map((e) => (
                  <li key={e.user_id}>
                    {names.get(e.user_id) ?? "Staff"}
                    <span className="small muted">on shift {formatHours((now.getTime() - Date.parse(e.started_at)) / 3600_000)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="panel">
          <h2>
            Alerts <Link href="/admin/notifications">All</Link>
          </h2>
          {notes.length === 0 ? (
            <p className="muted">No new alerts.</p>
          ) : (
            <ul className="list-plain">
              {notes.map((n) => (
                <li key={n.id}>
                  {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
                  <span className="small muted">{when(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
