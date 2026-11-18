import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { isLead } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { addTaskComment, setTaskStatus } from "../../../ops";
import { TaskForm } from "../TaskForm";

export const metadata = { title: "Task" };

const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "America/Aruba", dateStyle: "medium", timeStyle: "short" });

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff("tasks");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const [{ data: t }, { data: comments }, { data: events }, { data: team }] = await Promise.all([
    sb.from("tasks").select("*").eq("id", id).maybeSingle(),
    sb.from("task_comments").select("id, author, body, created_at").eq("task_id", id).order("id"),
    sb.from("task_events").select("id, actor, kind, detail, created_at").eq("task_id", id).order("id"),
    sb.from("staff").select("user_id, full_name, active").order("full_name"),
  ]);
  if (!t) notFound();
  const people = (team ?? []) as { user_id: string; full_name: string; active: boolean }[];
  const names = new Map(people.map((p) => [p.user_id, p.full_name]));
  const lead = isLead(me.role);
  const canEdit = lead || t.created_by === me.userId;
  const history = [
    ...((events ?? []) as { id: number; actor: string | null; kind: string; detail: string | null; created_at: string }[]).map((e) => ({
      at: e.created_at,
      key: `e${e.id}`,
      who: names.get(e.actor ?? "") ?? "Someone",
      text: e.kind === "created" ? "created the task" : e.kind === "status" ? `moved it ${e.detail?.replace("->", "→")}` : e.kind === "assigned" ? `assigned it to ${names.get(e.detail ?? "") ?? "someone"}` : "edited it",
      comment: false,
    })),
    ...((comments ?? []) as { id: number; author: string | null; body: string; created_at: string }[]).map((c) => ({
      at: c.created_at, key: `c${c.id}`, who: names.get(c.author ?? "") ?? "Someone", text: c.body, comment: true,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <p className="small">
        <Link href="/admin/tasks">Tasks</Link> / {t.title}
      </p>
      <h1 style={{ fontSize: "clamp(1.6rem,4vw,2.4rem)" }}>{t.title}</h1>
      <p className="row small">
        <span className={`tag ${t.status === "done" ? "ok" : t.status === "doing" ? "warn" : ""}`}>{t.status === "todo" ? "To do" : t.status === "doing" ? "Doing" : "Done"}</span>
        {t.priority !== "normal" ? <span className={`tag ${t.priority === "high" ? "bad" : ""}`}>{t.priority}</span> : null}
        <span>For {names.get(t.assigned_to ?? "") ?? "nobody"}</span>
        {t.due_on ? <span>· due {t.due_on}</span> : null}
        <span className="muted">· from {names.get(t.created_by ?? "") ?? "someone"}</span>
      </p>
      {t.details ? <p className="prose panel">{t.details}</p> : null}
      <ActionForm action={setTaskStatus} className="row" >
        <input type="hidden" name="id" value={t.id} />
        {t.status !== "doing" ? <button className="btn small" name="status" value="doing">Start</button> : null}
        {t.status !== "done" ? <button className="btn small papaya" name="status" value="done">Mark done</button> : null}
        {t.status !== "todo" ? <button className="btn ghost small" name="status" value="todo">Back to to do</button> : null}
      </ActionForm>

      <section className="section">
        <h2>Comments and history</h2>
        <ol className="timeline">
          {history.map((h) => (
            <li key={h.key}>
              <strong>{h.who}</strong> {h.comment ? <span className="prose" style={{ display: "block" }}>{h.text}</span> : <span className="muted">{h.text}</span>}
              <div className="small muted">{when(h.at)}</div>
            </li>
          ))}
        </ol>
        <ActionForm action={addTaskComment} resetOnSuccess>
          <input type="hidden" name="id" value={t.id} />
          <div className="field">
            <label htmlFor="body">Add a comment</label>
            <textarea id="body" name="body" required maxLength={2000} />
          </div>
          <button className="btn small">Comment</button>
        </ActionForm>
      </section>

      {canEdit ? (
        <section className="section">
          <h2>Edit task</h2>
          <TaskForm t={t} team={people.filter((p) => p.active)} canAssign={lead} me={me.userId} />
        </section>
      ) : null}
    </>
  );
}
