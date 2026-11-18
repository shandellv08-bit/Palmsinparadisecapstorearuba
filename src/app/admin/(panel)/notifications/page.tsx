import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { markNotificationsRead, openNotification } from "../../ops";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  await requireStaff("dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("notifications").select("id, title, link, created_at, read_at").order("id", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: number; title: string; link: string | null; created_at: string; read_at: string | null }[];
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <div className="spread">
        <h1>Notifications</h1>
        {unread ? (
          <ActionForm action={markNotificationsRead}>
            <button className="btn ghost small">Mark all read</button>
          </ActionForm>
        ) : null}
      </div>
      <p className="muted small">New orders, sold-out and low sizes, chat messages and tasks. Each one is sent once, not repeated.</p>
      {rows.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul className="list-plain panel">
          {rows.map((n) => (
            <li key={n.id}>
              <form action={openNotification} style={{ display: "contents" }}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link ?? "/admin"} />
                <button className="linkbtn" style={{ textAlign: "left", fontWeight: n.read_at ? 400 : 700 }}>
                  {n.title}
                </button>
              </form>
              <span className="small muted">
                {!n.read_at ? <span className="tag warn">new</span> : null}{" "}
                {new Date(n.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
