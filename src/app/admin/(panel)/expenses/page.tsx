import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES, formatMoney, sumByCategory, type ExpenseCategory } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { addExpense, deleteExpense } from "../../ops";

export const metadata = { title: "Expenses" };

const LABEL: Record<ExpenseCategory, string> = {
  stock: "Stock (caps bought outside a PO)", shipping: "Shipping and duties", marketing: "Marketing and ads", rent: "Rent",
  wages: "Wages", fees: "Bank and payment fees", equipment: "Equipment and supplies", other: "Other",
};

export default async function Expenses({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaff("finance");
  const raw = (await searchParams).month;
  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const sb = await supabaseServer();
  const [{ data }, { data: s }] = await Promise.all([
    sb.from("expenses").select("id, spent_on, category, amount_cents, description").gte("spent_on", `${month}-01`).lt("spent_on", `${next}-01`).order("spent_on", { ascending: false }),
    sb.from("settings").select("currency").eq("id", 1).single(),
  ]);
  const rows = (data ?? []) as { id: string; spent_on: string; category: ExpenseCategory; amount_cents: number; description: string }[];
  const cur = s?.currency ?? null;
  const totals = sumByCategory(rows);
  const total = rows.reduce((n, r) => n + r.amount_cents, 0);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <h1>Expenses</h1>
      <p className="muted">Everything the business pays for. Purchase orders track cap costs separately. Profit on the overview = margin on caps sold − these expenses.</p>
      <ActionForm action={addExpense} className="panel row" resetOnSuccess>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ex-date">Date</label>
          <input id="ex-date" name="spent_on" type="date" defaultValue={today} required style={{ width: "auto", minHeight: 46 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ex-cat">Category</label>
          <select id="ex-cat" name="category" style={{ width: "auto" }}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ex-amt">Amount</label>
          <input id="ex-amt" name="amount" type="text" inputMode="decimal" required style={{ width: "8rem" }} />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <label htmlFor="ex-desc">What for</label>
          <input id="ex-desc" name="description" type="text" required maxLength={300} />
        </div>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Add expense</button>
      </ActionForm>

      <div className="spread section" style={{ paddingBottom: ".5rem" }}>
        <h2 style={{ margin: 0 }}>{label}: {formatMoney(total, cur)}</h2>
        <p className="row small" style={{ margin: 0 }}>
          <Link href={`?month=${prev}`}>← Previous</Link>
          {month < today.slice(0, 7) ? <Link href={`?month=${next}`}>Next →</Link> : null}
        </p>
      </div>
      <div className="stats">
        {EXPENSE_CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
          <div key={c} className="stat">{LABEL[c]}<b>{formatMoney(totals[c], cur)}</b></div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty">No expenses this month.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>What</th><th>Category</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.spent_on}</td>
                  <td>{r.description}</td>
                  <td className="small">{LABEL[r.category]}</td>
                  <td className="num">{formatMoney(r.amount_cents, cur)}</td>
                  <td>
                    <ActionForm action={deleteExpense} confirm="Remove this expense?">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="linkbtn small">Remove</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
