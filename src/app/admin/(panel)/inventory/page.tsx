import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { sortSizes, stockLevel } from "@/lib/engine";

export const metadata = { title: "Stock" };

const REASONS: Record<string, string> = { initial: "First count", restock: "Restock", adjustment: "Correction", damaged: "Damaged", order: "Order", cancel: "Order cancelled" };

export default async function Inventory() {
  await requireStaff("inventory");
  const sb = await supabaseServer();
  const [{ data: products }, { data: moves }, { data: s }] = await Promise.all([
    sb.from("products").select("id, name, status, product_variants(id, size, stock)").neq("status", "archived").order("name"),
    sb.from("inventory_movements").select("id, change, stock_after, reason, note, created_at, product_variants(size, products(name))").order("id", { ascending: false }).limit(30),
    sb.from("settings").select("low_stock_threshold").eq("id", 1).single(),
  ]);
  const threshold = s?.low_stock_threshold ?? 2;
  const rows = (products ?? []) as { id: string; name: string; status: string; product_variants: { id: string; size: string; stock: number }[] }[];
  const log = (moves ?? []) as unknown as { id: number; change: number; stock_after: number; reason: string; note: string | null; created_at: string; product_variants: { size: string; products: { name: string } } | null }[];
  return (
    <>
      <h1>Stock</h1>
      <p className="muted">To change stock, open a product. Every change is logged below.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Sizes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const order = sortSizes(p.product_variants.map((v) => v.size));
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                    {p.status !== "active" ? <div className="small muted">{p.status}</div> : null}
                  </td>
                  <td>
                    <div className="row small">
                      {[...p.product_variants]
                        .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
                        .map((v) => {
                          const level = stockLevel(v.stock, threshold);
                          return (
                            <span key={v.id} className={`tag ${level === "sold_out" ? "bad" : level === "low" ? "warn" : ""}`}>
                              {v.size}: {v.stock}
                            </span>
                          );
                        })}
                      {p.product_variants.length === 0 ? <span className="muted">no sizes</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="section">Recent changes</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Cap</th>
              <th>Reason</th>
              <th className="num">Change</th>
              <th className="num">After</th>
            </tr>
          </thead>
          <tbody>
            {log.map((m) => (
              <tr key={m.id}>
                <td className="small">{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  {m.product_variants ? `${m.product_variants.products.name}, ${m.product_variants.size}` : "removed size"}
                  {m.note ? <div className="small muted">{m.note}</div> : null}
                </td>
                <td>{REASONS[m.reason] ?? m.reason}</td>
                <td className="num">{m.change > 0 ? `+${m.change}` : m.change}</td>
                <td className="num">{m.stock_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
