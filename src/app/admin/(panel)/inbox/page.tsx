import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Chat inbox" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireStaff("messages");
  const { show } = await searchParams;
  const sb = await supabaseServer();
  let q = sb
    .from("conversations")
    .select("id, customer_name, customer_contact, status, unread_by_staff, needs_human, assigned_to, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (show === "closed") q = q.eq("status", "closed");
  else if (show === "mine") q = q.eq("assigned_to", me.userId).eq("status", "open");
  else q = q.eq("status", "open");
  const [{ data }, { data: team }] = await Promise.all([q, sb.from("staff").select("user_id, full_name")]);
  const names = new Map(((team ?? []) as { user_id: string; full_name: string }[]).map((t) => [t.user_id, t.full_name]));
  const rows = (data ?? []) as { id: string; customer_name: string; customer_contact: string | null; status: string; unread_by_staff: boolean; assigned_to: string | null; last_message_at: string }[];
  rows.sort((a, b) => Number(b.unread_by_staff) - Number(a.unread_by_staff));
  return (
    <>
      <h1>Chat inbox</h1>
      <p className="row small">
        Show: <Link href="/admin/inbox" aria-current={!show ? "page" : undefined}>Open</Link>
        <Link href="?show=mine" aria-current={show === "mine" ? "page" : undefined}>Mine</Link>
        <Link href="?show=closed" aria-current={show === "closed" ? "page" : undefined}>Closed</Link>
      </p>
      <p className="small muted">Customers start chats from the chat button on every store page. Waiting chats are on top.</p>
      {rows.length === 0 ? (
        <p className="empty">No chats here.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Handled by</th>
                <th>Last message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.unread_by_staff ? "unread-row" : undefined}>
                  <td>
                    <Link href={`/admin/inbox/${c.id}`}>{c.unread_by_staff ? <strong>{c.customer_name}</strong> : c.customer_name}</Link>
                    {c.unread_by_staff ? <> <span className="tag warn">waiting</span></> : null}
                    <div className="small muted">{c.customer_contact ?? "no contact given"}</div>
                  </td>
                  <td>{c.assigned_to ? names.get(c.assigned_to) ?? "staff" : <span className="muted">nobody yet</span>}</td>
                  <td className="small">{new Date(c.last_message_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
