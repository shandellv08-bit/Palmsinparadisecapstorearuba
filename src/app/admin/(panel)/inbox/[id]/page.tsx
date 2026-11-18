import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { chatReply, chatUpdate } from "../../../ops";
import { MarkRead } from "./MarkRead";

export const metadata = { title: "Chat" };

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff("messages");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data: c }, { data: msgs }, { data: team }] = await Promise.all([
    sb.from("conversations").select("*").eq("id", id).maybeSingle(),
    sb.from("chat_messages").select("id, sender, staff_id, body, created_at").eq("conversation_id", id).order("id"),
    sb.from("staff").select("user_id, full_name"),
  ]);
  if (!c) notFound();
  const names = new Map(((team ?? []) as { user_id: string; full_name: string }[]).map((t) => [t.user_id, t.full_name]));
  const messages = (msgs ?? []) as { id: number; sender: string; staff_id: string | null; body: string; created_at: string }[];
  // Link to an existing customer if the contact matches (plain equality filters, never string-built queries).
  const contact: string = c.customer_contact ?? "";
  const digits = contact.replace(/\D/g, "");
  const [byEmail, byPhone] = await Promise.all([
    contact.includes("@") ? sb.from("customers").select("id, name").eq("email", contact.toLowerCase()).limit(1) : Promise.resolve({ data: [] }),
    digits.length >= 7 ? sb.from("customers").select("id, name").eq("phone_key", digits).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const seen = new Set<string>();
  const orders = [...(byEmail.data ?? []), ...(byPhone.data ?? [])].filter((o) => !seen.has(o.id) && seen.add(o.id));

  return (
    <>
      <AutoRefresh seconds={10} />
      {c.unread_by_staff ? <MarkRead id={c.id} /> : null}
      <p className="small">
        <Link href="/admin/inbox">Chat inbox</Link> / {c.customer_name}
      </p>
      <div className="spread">
        <h1 style={{ marginBottom: ".25rem" }}>{c.customer_name}</h1>
        <span className={`tag ${c.status === "open" ? "ok" : ""}`}>{c.status}</span>
      </div>
      <p className="muted">
        {c.customer_contact ?? "No contact given"} · handled by {c.assigned_to ? names.get(c.assigned_to) ?? "staff" : "nobody yet"}
        {orders.map((o: { id: string; name: string }) => (
          <span key={o.id}>
            {" "}
            · <Link href={`/admin/customers/${o.id}`}>customer record</Link>
          </span>
        ))}
      </p>
      <div className="two-col wide-left">
        <section>
          <ol className="thread" aria-label="Messages">
            {messages.map((m) => (
              <li key={m.id} className={m.sender}>
                {m.body}
                <span className="when">
                  {m.sender === "staff" ? `${names.get(m.staff_id ?? "") ?? "Staff"} · ` : m.sender === "customer" ? `${c.customer_name} · ` : ""}
                  {new Date(m.created_at).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ol>
          <ActionForm action={chatReply} resetOnSuccess>
            <input type="hidden" name="id" value={c.id} />
            <div className="field">
              <label htmlFor="reply">Reply</label>
              <textarea id="reply" name="body" required maxLength={2000} placeholder="The customer sees this in their chat window." />
            </div>
            <button className="btn">Send reply</button>
          </ActionForm>
        </section>
        <aside className="panel stack">
          <h2 style={{ fontSize: "1.1rem" }}>Conversation</h2>
          <ActionForm action={chatUpdate} className="row">
            <input type="hidden" name="id" value={c.id} />
            {c.assigned_to !== me.userId ? (
              <button className="btn ghost small" name="op" value="assign_me">
                Assign to me
              </button>
            ) : null}
            {c.status === "open" ? (
              <button className="btn ghost small" name="op" value="close">
                Close chat
              </button>
            ) : (
              <button className="btn ghost small" name="op" value="reopen">
                Reopen
              </button>
            )}
          </ActionForm>
          <p className="small muted">
            Replying assigns the chat to you if nobody has it. Customers never see costs or other customers. Do not share card numbers or passwords in chat.
          </p>
        </aside>
      </div>
    </>
  );
}
