import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { areasFor, formatHours, hoursWorked, ROLE_LABELS, ROLES, type TimeEntry } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { addTeamMember, updateTeamMember } from "../../manage";

export const metadata = { title: "Team" };

export default async function Team() {
  const me = await requireStaff("team");
  const sb = await supabaseServer();
  const { data } = await sb.from("staff").select("user_id, full_name, email, role, active").order("created_at");
  const rows = (data ?? []) as { user_id: string; full_name: string; email: string; role: (typeof ROLES)[number]; active: boolean }[];
  // last 30 days of activity per person
  const since = new Date(Date.now() - 30 * 864e5);
  const [{ data: done }, { data: events }, { data: chats }, { data: shifts }] = await Promise.all([
    sb.from("tasks").select("assigned_to").eq("status", "done").gte("done_at", since.toISOString()),
    sb.from("order_events").select("actor").not("actor", "is", null).gte("created_at", since.toISOString()),
    sb.from("chat_messages").select("staff_id").eq("sender", "staff").gte("created_at", since.toISOString()),
    sb.from("time_entries").select("user_id, started_at, ended_at").gte("started_at", new Date(since.getTime() - 864e5).toISOString()),
  ]);
  const tally = (list: Record<string, string | null>[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of list ?? []) if (r[key]) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const tasksDone = tally(done as Record<string, string | null>[], "assigned_to");
  const orderActions = tally(events as Record<string, string | null>[], "actor");
  const chatReplies = tally(chats as Record<string, string | null>[], "staff_id");
  const hours = hoursWorked((shifts ?? []) as TimeEntry[], since, new Date(Date.now() + 864e5), new Date());
  return (
    <>
      <h1>Team</h1>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role and access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.user_id}>
                <td>
                  {t.full_name}
                  <div className="small muted">{t.email}</div>
                </td>
                <td>
                  <ActionForm action={updateTeamMember} className="row">
                    <input type="hidden" name="userId" value={t.user_id} />
                    <label className="sr-only" htmlFor={`role-${t.user_id}`}>
                      Role
                    </label>
                    <select id={`role-${t.user_id}`} name="role" defaultValue={t.role} style={{ width: "auto" }} disabled={t.user_id === me.userId}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {t.user_id === me.userId ? <input type="hidden" name="role" value={t.role} /> : null}
                    <label className="choice">
                      <input type="checkbox" name="active" defaultChecked={t.active} disabled={t.user_id === me.userId} /> Active
                    </label>
                    {t.user_id === me.userId ? <input type="hidden" name="active" value="on" /> : <button className="btn small">Save</button>}
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section">
        <h2>Last 30 days</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Person</th><th className="num">Hours</th><th className="num">Tasks done</th><th className="num">Order updates</th><th className="num">Chat replies</th></tr></thead>
            <tbody>
              {rows.filter((t) => t.active).map((t) => (
                <tr key={t.user_id}>
                  <td>{t.full_name}</td>
                  <td className="num">{formatHours(hours.get(t.user_id) ?? 0)}</td>
                  <td className="num">{tasksDone.get(t.user_id) ?? 0}</td>
                  <td className="num">{orderActions.get(t.user_id) ?? 0}</td>
                  <td className="num">{chatReplies.get(t.user_id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Add a team member</h2>
        <ActionForm action={addTeamMember} className="panel" resetOnSuccess>
          <div className="field">
            <label htmlFor="full_name">Name</label>
            <input id="full_name" name="full_name" type="text" required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="t-email">Email</label>
            <input id="t-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="t-role">Role</label>
            <select id="t-role" name="role" defaultValue="support">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}: {areasFor(r).join(", ")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-password">Temporary password</label>
            <input id="t-password" name="password" type="text" required minLength={12} autoComplete="new-password" />
            <p className="hint">At least 12 characters. Tell them in person, not by text.</p>
          </div>
          <button className="btn">Add team member</button>
        </ActionForm>
      </section>
    </>
  );
}
