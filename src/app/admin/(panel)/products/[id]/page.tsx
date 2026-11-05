import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { photoUrl } from "@/lib/config";
import { env } from "@/lib/env";
import { roleCan, sortSizes, stockLevel } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { ProductForm } from "../ProductForm";
import { PhotoUploader } from "./PhotoUploader";
import { adjustStock, deleteVariant, photoAction } from "../../../manage";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const staff = await requireStaff("products");
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const showCost = roleCan(staff.role, "finance");
  const [{ data: p }, { data: cost }, { data: s }] = await Promise.all([
    sb.from("products").select("*, product_variants(id, size, sku, stock, sort)").eq("id", id).maybeSingle(),
    showCost ? sb.from("product_costs").select("cost_cents").eq("product_id", id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("settings").select("low_stock_threshold").eq("id", 1).single(),
  ]);
  if (!p) notFound();
  const order = sortSizes((p.product_variants as { size: string }[]).map((v) => v.size));
  const variants = [...(p.product_variants as { id: string; size: string; stock: number }[])].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
  const canStock = roleCan(staff.role, "inventory");

  return (
    <>
      <p className="small">
        <Link href="/admin/products">Products</Link> / {p.name}
      </p>
      <div className="spread">
        <h1>{p.name}</h1>
        {p.status === "active" ? (
          <Link href={`/shop/${p.slug}`} target="_blank">
            View on store
          </Link>
        ) : (
          <span className="tag">{p.status}: not on the store</span>
        )}
      </div>
      {created ? <p className="success">Product created. Add photos and stock below, then set it to Active.</p> : null}

      <section className="section">
        <h2>Photos</h2>
        <div className="photos">
          {(p.images as string[]).map((base, i) => (
            <div key={base}>
              <div className="crown">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(base, 600)} alt={`Photo ${i + 1}`} width={600} height={600} />
              </div>
              <ActionForm action={photoAction} className="row small">
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="base" value={base} />
                {i > 0 ? (
                  <button className="linkbtn" name="op" value="first">
                    Make main
                  </button>
                ) : (
                  <span className="muted">Main</span>
                )}
                <button className="linkbtn" name="op" value="remove">
                  Remove
                </button>
              </ActionForm>
            </div>
          ))}
        </div>
        {(p.images as string[]).length < 8 ? (
          <PhotoUploader productId={p.id} supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL!} anonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY!} remaining={8 - (p.images as string[]).length} />
        ) : (
          <p className="muted">8 photos is the maximum.</p>
        )}
      </section>

      <section className="section">
        <h2>Sizes and stock</h2>
        {variants.length === 0 ? <p className="muted">No sizes yet. Add sizes in the form below.</p> : null}
        <div className="table-scroll">
          <table>
            <tbody>
              {variants.map((v) => {
                const level = stockLevel(v.stock, s?.low_stock_threshold ?? 2);
                return (
                  <tr key={v.id}>
                    <th scope="row">{v.size}</th>
                    <td className="num">
                      {v.stock}{" "}
                      {level !== "in_stock" ? <span className={`tag ${level === "sold_out" ? "bad" : "warn"}`}>{level === "sold_out" ? "sold out" : "low"}</span> : null}
                    </td>
                    <td>
                      {canStock ? (
                        <ActionForm action={adjustStock} className="row">
                          <input type="hidden" name="variantId" value={v.id} />
                          <label className="sr-only" htmlFor={`chg-${v.id}`}>
                            Change for size {v.size}
                          </label>
                          <input id={`chg-${v.id}`} name="change" type="number" step={1} placeholder="+5 or -1" style={{ width: "7rem" }} required />
                          <label className="sr-only" htmlFor={`rsn-${v.id}`}>
                            Reason
                          </label>
                          <select id={`rsn-${v.id}`} name="reason" defaultValue={v.stock === 0 ? "initial" : "restock"} style={{ width: "auto" }}>
                            <option value="initial">First count</option>
                            <option value="restock">Restock</option>
                            <option value="adjustment">Correction</option>
                            <option value="damaged">Damaged</option>
                          </select>
                          <button className="btn small">Update</button>
                        </ActionForm>
                      ) : null}
                    </td>
                    <td>
                      {v.stock === 0 ? (
                        <ActionForm action={deleteVariant} confirm={`Remove size ${v.size}?`}>
                          <input type="hidden" name="variantId" value={v.id} />
                          <button className="linkbtn small">Remove size</button>
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Details</h2>
        <ProductForm p={{ ...p, cost_cents: cost?.cost_cents ?? null }} showCost={showCost} />
      </section>
    </>
  );
}
