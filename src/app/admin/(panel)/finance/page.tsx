import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/engine";
import { loadSales } from "./report";
import { ActionForm } from "@/components/admin/ActionForm";
import { setGoal } from "../../ops";

export const metadata = { title: "Sales & margin" };

const PERIODS = [7, 30, 90, 365];

export default async function Finance({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaff("finance");
  const d = Number((await searchParams).days);
  const days = PERIODS.includes(d) ? d : 30;
  const sb = await supabaseServer();
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const [{ rows, totals }, { data: s }, { data: audit }, { data: goal }, { data: exp }] = await Promise.all([
    loadSales(days),
    sb.from("settings").select("currency").eq("id", 1).single(),
    sb.from("audit_log").select("id, action, entity, created_at, actor").order("id", { ascending: false }).limit(15),
    sb.from("goals").select("monthly_sales_target_cents").eq("id", 1).maybeSingle(),
    sb.from("expenses").select("amount_cents").gte("spent_on", since),
  ]);
  const expenses = ((exp ?? []) as { amount_cents: number }[]).reduce((n, e) => n + e.amount_cents, 0);
  const cur = s?.currency ?? null;
  const pct = (p: number | null) => (p === null ? "cost not set" : `${p}%`);
  return (
    <>
      <div className="spread">
        <h1>Sales &amp; margin</h1>
        <a className="btn ghost small" href={`/admin/finance/export?days=${days}`}>
          Download CSV
        </a>
      </div>
      <p className="row small">
        Period:{" "}
        {PERIODS.map((p) => (
          <Link key={p} href={`?days=${p}`} aria-current={p === days ? "page" : undefined}>
            {p} days
          </Link>
        ))}
      </p>
      <div className="stats">
        <div className="stat">
          Sales<b>{formatMoney(totals.revenueCents, cur)}</b>
        </div>
        <div className="stat">
          Caps sold<b>{totals.unitsSold}</b>
        </div>
        <div className="stat">
          Margin (where cost is known)<b>{totals.marginPct === null ? "—" : formatMoney(totals.marginCents, cur)}</b>
          <span className="small muted">{pct(totals.marginPct)}</span>
        </div>
        <div className="stat">
          Expenses<b>{formatMoney(expenses, cur)}</b>
          <Link className="small" href="/admin/expenses">Expenses</Link>
        </div>
        <div className="stat">
          Profit<b>{formatMoney(totals.marginCents - expenses, cur)}</b>
          <span className="small muted">margin − expenses</span>
        </div>
      </div>
      <ActionForm action={setGoal} className="panel row" >
        <div className="field" style={{ margin: 0 }} id="goal">
          <label htmlFor="target">Monthly sales goal</label>
          <input id="target" name="target" type="text" inputMode="decimal" defaultValue={goal?.monthly_sales_target_cents != null ? (goal.monthly_sales_target_cents / 100).toFixed(2) : ""} style={{ width: "10rem" }} />
        </div>
        <button className="btn small" style={{ alignSelf: "flex-end" }}>Save goal</button>
        <p className="small muted" style={{ margin: 0, alignSelf: "center", flex: 1 }}>Private: only owner and manager see it. Progress shows on My work.</p>
      </ActionForm>
      {totals.unitsWithoutCost > 0 ? (
        <p className="notice">{totals.unitsWithoutCost} caps sold have no cost recorded, so they are left out of the margin. Add costs on each product.</p>
      ) : null}
      <p className="small muted">Counts every order that was not cancelled, paid or not.</p>
      {rows.length === 0 ? (
        <p className="empty">No sales in this period.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Sold</th>
                <th className="num">Sales</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productKey}>
                  <td>{r.productName}</td>
                  <td className="num">{r.unitsSold}</td>
                  <td className="num">{formatMoney(r.revenueCents, cur)}</td>
                  <td className="num">
                    {r.marginPct === null ? <span className="muted">cost not set</span> : `${formatMoney(r.marginCents, cur)} (${r.marginPct}%)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="section">Recent activity</h2>
      <ul className="small">
        {(audit ?? []).map((a) => (
          <li key={a.id}>
            {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })} · {a.action}
          </li>
        ))}
      </ul>
    </>
  );
}
