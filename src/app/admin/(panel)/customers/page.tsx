import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { formatMoney } from "@/lib/engine";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; removed?: string }> }) {
  await requireStaff("customers");
  const { q, removed } = await searchParams;
  const term = (q ?? "").trim().slice(0, 60);
  const sb = await supabaseServer();
  const [{ data }, { data: s }] = await Promise.all([
    (term
      ? /\d{3,}/.test(term)
        ? sb.from("customers").select("id, name, phone, email, created_at, orders(total_cents, status)").is("anonymised_at", null).like("phone_key", `%${term.replace(/\D/g, "")}%`)
        : sb.from("customers").select("id, name, phone, email, created_at, orders(total_cents, status)").is("anonymised_at", null).ilike("name", `%${term.replace(/[%_\\]/g, "")}%`)
      : sb.from("customers").select("id, name, phone, email, created_at, orders(total_cents, status)").is("anonymised_at", null)
    ).order("created_at", { ascending: false }).limit(500),
    sb.from("settings").select("currency").eq("id", 1).single(),
  ]);
  const rows = (data ?? []) as { id: string; name: string; phone: string | null; email: string | null; created_at: string; orders: { total_cents: number; status: string }[] }[];
  return (
    <>
      <h1>Customers</h1>
      <p className="muted">Customers are recognised by phone number when they order again.</p>
      {removed ? <p className="success">Customer details removed.</p> : null}
      <form className="row" role="search" style={{ marginBottom: "1rem" }}>
        <label htmlFor="cq" className="sr-only">Search customers</label>
        <input id="cq" name="q" type="search" defaultValue={term} placeholder="Name or phone" style={{ maxWidth: 320 }} />
        <button className="btn small">Search</button>
      </form>
      {rows.length === 0 ? (
        <p className="empty">No customers yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th className="num">Orders</th>
                <th className="num">Spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const valid = c.orders.filter((o) => o.status !== "cancelled");
                return (
                  <tr key={c.id}>
                    <td><Link href={`/admin/customers/${c.id}`}>{c.name}</Link></td>
                    <td className="small">
                      {c.phone}
                      {c.email ? <div>{c.email}</div> : null}
                    </td>
                    <td className="num">{valid.length}</td>
                    <td className="num">{formatMoney(valid.reduce((n, o) => n + o.total_cents, 0), s?.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
