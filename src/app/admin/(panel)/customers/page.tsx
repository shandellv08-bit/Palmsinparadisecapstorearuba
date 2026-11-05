import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/engine";

export const metadata = { title: "Customers" };

export default async function Customers() {
  await requireStaff("customers");
  const sb = await supabaseServer();
  const [{ data }, { data: s }] = await Promise.all([
    sb.from("customers").select("id, name, phone, email, created_at, orders(total_cents, status)").is("anonymised_at", null).order("created_at", { ascending: false }).limit(500),
    sb.from("settings").select("currency").eq("id", 1).single(),
  ]);
  const rows = (data ?? []) as { id: string; name: string; phone: string | null; email: string | null; created_at: string; orders: { total_cents: number; status: string }[] }[];
  return (
    <>
      <h1>Customers</h1>
      <p className="muted">Customers are recognised by phone number when they order again.</p>
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
                    <td>{c.name}</td>
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
