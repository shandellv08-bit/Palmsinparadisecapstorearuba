import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { setMessageStatus } from "../../manage";

export const metadata = { title: "Messages" };

export default async function Messages() {
  await requireStaff("messages");
  const sb = await supabaseServer();
  const { data } = await sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; name: string; contact: string; message: string; status: string; created_at: string }[];
  return (
    <>
      <h1>Messages</h1>
      {rows.length === 0 ? <p className="empty">No messages yet.</p> : null}
      <div className="stack">
        {rows.map((m) => (
          <article key={m.id} className="panel" style={{ opacity: m.status === "handled" ? 0.75 : 1 }}>
            <div className="spread">
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
                {m.name} <span className="small muted">· {m.contact}</span>
              </h2>
              <span className={`tag ${m.status === "new" ? "warn" : "ok"}`}>{m.status}</span>
            </div>
            <p className="small muted">{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba" })}</p>
            <p className="prose">{m.message}</p>
            <ActionForm action={setMessageStatus}>
              <input type="hidden" name="id" value={m.id} />
              <button className="btn ghost small" name="status" value={m.status === "new" ? "handled" : "new"}>
                {m.status === "new" ? "Mark handled" : "Mark as new"}
              </button>
            </ActionForm>
          </article>
        ))}
      </div>
    </>
  );
}
