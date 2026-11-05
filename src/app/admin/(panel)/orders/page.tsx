import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, formatOrderNumber, ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/engine";

export const metadata = { title: "Orders" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff("orders");
  const { status } = await searchParams;
  const sb = await supabaseServer();
  let q = sb
    .from("orders")
    .select("id, number, status, payment_status, fulfilment, total_cents, currency, created_at, customers(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if ((ORDER_STATUSES as readonly string[]).includes(status ?? "")) q = q.eq("status", status!);
  else if (status !== "all") q = q.in("status", ["new", "confirmed", "ready"]);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; number: number; status: OrderStatus; payment_status: string; fulfilment: string; total_cents: number; currency: string | null; created_at: string; customers: { name: string } | null;
  }[];
  return (
    <>
      <h1>Orders</h1>
      <p className="row small">
        Show: <Link href="/admin/orders">Open</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`?status=${s}`}>
            {STATUS_LABELS[s]}
          </Link>
        ))}
        <Link href="?status=all">All</Link>
      </p>
      {rows.length === 0 ? (
        <p className="empty">No orders here.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`}>{formatOrderNumber(o.number)}</Link>
                    <div className="small muted">
                      {new Date(o.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })} · {o.fulfilment}
                    </div>
                  </td>
                  <td>{o.customers?.name ?? "—"}</td>
                  <td>
                    <span className={`tag ${o.status === "cancelled" ? "bad" : o.status === "completed" ? "ok" : ""}`}>{STATUS_LABELS[o.status]}</span>
                  </td>
                  <td>
                    <span className={`tag ${o.payment_status === "paid" ? "ok" : "warn"}`}>{o.payment_status}</span>
                  </td>
                  <td className="num">{formatMoney(o.total_cents, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
