import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { formatMoney, formatOrderNumber } from "@/lib/engine";
import { displayName } from "@/lib/settings";
import { loadOrder } from "../data";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Pack slip" };

export default async function Slip({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("orders");
  const [o, s] = await Promise.all([loadOrder((await params).id), getSettings()]);
  if (!o) notFound();
  return (
    <div style={{ maxWidth: 640 }}>
      <PrintButton />
      <h1 style={{ fontSize: "1.6rem" }}>{displayName(s)}</h1>
      <h2>Pack slip {formatOrderNumber(o.number)}</h2>
      <p>
        {new Date(o.created_at).toLocaleDateString("en-GB", { timeZone: "America/Aruba" })} · {o.fulfilment}
        <br />
        {o.customers?.name}
        {o.customers?.phone ? ` · ${o.customers.phone}` : ""}
        {o.delivery_address ? (
          <>
            <br />
            <span className="prose">{o.delivery_address}</span>
          </>
        ) : null}
      </p>
      <table>
        <thead>
          <tr>
            <th>Packed</th>
            <th>Cap</th>
            <th>Size</th>
            <th className="num">Qty</th>
          </tr>
        </thead>
        <tbody>
          {o.order_items.map((i) => (
            <tr key={i.id}>
              <td>☐</td>
              <td>{i.product_name}</td>
              <td>{i.size}</td>
              <td className="num">{i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "1rem" }}>
        Total {formatMoney(o.total_cents, o.currency)} · Payment: {o.payment_status}
      </p>
      {o.customer_note ? <p className="prose">Note: {o.customer_note}</p> : null}
    </div>
  );
}
