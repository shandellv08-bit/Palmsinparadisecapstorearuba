import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { isLead } from "@/lib/engine";
import { TaskForm } from "./TaskForm";

export const metadata = { title: "Tasks" };

type Task = { id: string; title: string; status: "todo" | "doing" | "done"; priority: string; due_on: string | null; assigned_to: string | null; done_at: string | null };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const me = await requireStaff("tasks");
  const lead = isLead(me.role);
  const { who } = await searchParams;
  const sb = await supabaseServer();
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  let q = sb.from("tasks").select("id, title, status, priority, due_on, assigned_to, done_at").or(`status.neq.done,done_at.gte.${since}`).order("due_on", { ascending: true, nullsFirst: false }).limit(300);
  if (who === "me" || !lead) q = q.eq("assigned_to", me.userId);
  else if (who && /^[0-9a-f-]{36}$/.test(who)) q = q.eq("assigned_to", who);
  const [{ data }, { data: team }] = await Promise.all([q, sb.from("staff").select("user_id, full_name").eq("active", true).order("full_name")]);
  const people = (team ?? []) as { user_id: string; full_name: string }[];
  const names = new Map(people.map((p) => [p.user_id, p.full_name]));
  const tasks = (data ?? []) as Task[];
  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const rank = { high: 0, normal: 1, low: 2 } as Record<string, number>;
  const col = (status: Task["status"]) => tasks.filter((t) => t.status === status).sort((a, b) => rank[a.priority] - rank[b.priority]);

  return (
    <>
      <h1>Tasks</h1>
      {lead ? (
        <p className="row small">
          Show: <Link href="/admin/tasks" aria-current={!who ? "page" : undefined}>Everyone</Link>
          <Link href="?who=me" aria-current={who === "me" ? "page" : undefined}>Mine</Link>
          {people.filter((p) => p.user_id !== me.userId).map((p) => (
            <Link key={p.user_id} href={`?who=${p.user_id}`} aria-current={who === p.user_id ? "page" : undefined}>
              {p.full_name}
            </Link>
          ))}
        </p>
      ) : (
        <p className="small muted">Your tasks. The owner or a manager can give you more.</p>
      )}
      <div className="board">
        {(["todo", "doing", "done"] as const).map((st) => (
          <section key={st} className="col" aria-labelledby={`col-${st}`}>
            <h2 id={`col-${st}`}>
              {st === "todo" ? "To do" : st === "doing" ? "Doing" : "Done (last 14 days)"} · {col(st).length}
            </h2>
            {col(st).map((t) => (
              <Link key={t.id} href={`/admin/tasks/${t.id}`} className={`task-card${t.due_on && t.due_on < today && st !== "done" ? " overdue" : ""}`}>
                {t.title}
                <span className="meta">
                  {t.priority === "high" ? <span className="tag bad">high</span> : t.priority === "low" ? <span className="tag">low</span> : null}
                  {t.due_on ? <span>due {t.due_on}</span> : null}
                  {lead && t.assigned_to ? <span>{names.get(t.assigned_to)}</span> : null}
                </span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      <section className="section">
        <h2>New task</h2>
        <TaskForm team={people} canAssign={lead} me={me.userId} />
      </section>
    </>
  );
}
