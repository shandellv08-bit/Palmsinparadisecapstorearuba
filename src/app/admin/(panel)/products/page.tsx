import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney, summariseStock } from "@/lib/engine";

export const metadata = { title: "Products" };

export default async function Products({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff("products");
  const { status } = await searchParams;
  const sb = await supabaseServer();
  let q = sb.from("products").select("id, name, slug, team, status, price_cents, featured, product_variants(stock)").order("name");
  if (status === "draft" || status === "active" || status === "archived") q = q.eq("status", status);
  const [{ data }, { data: s }] = await Promise.all([q, sb.from("settings").select("currency").eq("id", 1).single()]);
  const rows = (data ?? []) as { id: string; name: string; team: string | null; status: string; price_cents: number; featured: boolean; product_variants: { stock: number }[] }[];
  return (
    <>
      <div className="spread">
        <h1>Products</h1>
        <Link href="/admin/products/new" className="btn">
          New product
        </Link>
      </div>
      <p className="row small">
        Show: <Link href="/admin/products">All</Link> <Link href="?status=active">Active</Link> <Link href="?status=draft">Draft</Link>{" "}
        <Link href="?status=archived">Archived</Link>
      </p>
      {rows.length === 0 ? (
        <p className="empty">No products yet. Add your first one.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="num">Price</th>
                <th className="num">In stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = summariseStock(p.product_variants);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
                      <div className="small muted">{p.team ?? ""}</div>
                    </td>
                    <td>
                      <span className={`tag ${p.status === "active" ? "ok" : ""}`}>{p.status}</span>
                    </td>
                    <td className="num">{formatMoney(p.price_cents, s?.currency)}</td>
                    <td className="num">{st.soldOut ? <span className="tag bad">0</span> : st.total}</td>
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
