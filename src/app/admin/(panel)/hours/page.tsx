import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { arubaMonthStart, arubaWeekStart, formatHours, hoursWorked, isLead, roleCan, type TimeEntry } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { fixTimeEntry } from "../../ops";

export const metadata = { title: "Hours" };

const local = (d: string | null) =>
  d ? new Date(Date.parse(d) - 4 * 3600_000).toISOString().slice(0, 16) : ""; // for datetime-local inputs, Aruba time
const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "America/Aruba", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Hours() {
  const me = await requireStaff("hours");
  const lead = isLead(me.role);
  const now = new Date();
  const week = arubaWeekStart(now);
  const lastWeek = new Date(week.getTime() - 7 * 864e5);
  const month = arubaMonthStart(now);
  const from = new Date(Math.min(lastWeek.getTime(), month.getTime()));
  const sb = await supabaseServer();
  const [{ data }, { data: team }] = await Promise.all([
    sb.from("time_entries").select("id, user_id, started_at, ended_at, note").gte("started_at", new Date(from.getTime() - 864e5).toISOString()).order("started_at", { ascending: false }).limit(2000),
    sb.from("staff").select("user_id, full_name, active").order("full_name"),
  ]);
  const entries = (data ?? []) as (TimeEntry & { id: number; note: string | null })[];
  const people = ((team ?? []) as { user_id: string; full_name: string; active: boolean }[]).filter((p) => lead || p.user_id === me.userId);
  const end = new Date(now.getTime() + 864e5);
  const thisWeek = hoursWorked(entries, week, end, now);
  const prevWeek = hoursWorked(entries, lastWeek, week, now);
  const thisMonth = hoursWorked(entries, month, end, now);
  const mine = entries.filter((e) => e.user_id === me.userId && Date.parse(e.started_at) >= lastWeek.getTime());
  const names = new Map(people.map((p) => [p.user_id, p.full_name]));

  return (
    <>
      <div className="spread">
        <h1>Hours</h1>
        {lead ? (
          <a className="btn ghost small" href="/admin/hours/export">
            Download this month (CSV)
          </a>
        ) : null}
      </div>
      <p className="small muted">Clock in and out from the menu. Times are Aruba time. Weeks start on Monday.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th className="num">This week</th>
              <th className="num">Last week</th>
              <th className="num">This month</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id}>
                <td>{p.full_name}{!p.active ? <span className="small muted"> (inactive)</span> : null}</td>
                <td className="num">{formatHours(thisWeek.get(p.user_id) ?? 0)}</td>
                <td className="num">{formatHours(prevWeek.get(p.user_id) ?? 0)}</td>
                <td className="num">{formatHours(thisMonth.get(p.user_id) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section">
        <h2>{lead ? "Shifts (last two weeks)" : "My shifts (last two weeks)"}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {lead ? <th>Person</th> : null}
                <th>Start</th>
                <th>End</th>
                <th className="num">Length</th>
                {roleCan(me.role, "team") ? <th>Correct</th> : null}
              </tr>
            </thead>
            <tbody>
              {(lead ? entries.filter((e) => Date.parse(e.started_at) >= lastWeek.getTime()) : mine).map((e) => (
                <tr key={e.id}>
                  {lead ? <td>{names.get(e.user_id) ?? "Staff"}</td> : null}
                  <td>{when(e.started_at)}</td>
                  <td>{e.ended_at ? when(e.ended_at) : <span className="tag ok">on shift</span>}{e.note ? <div className="small muted">{e.note}</div> : null}</td>
                  <td className="num">{formatHours(((e.ended_at ? Date.parse(e.ended_at) : now.getTime()) - Date.parse(e.started_at)) / 3600_000)}</td>
                  {roleCan(me.role, "team") ? (
                    <td>
                      <ActionForm action={fixTimeEntry} className="row small">
                        <input type="hidden" name="id" value={e.id} />
                        <label className="sr-only" htmlFor={`s${e.id}`}>Start</label>
                        <input id={`s${e.id}`} name="start" type="datetime-local" defaultValue={local(e.started_at)} required style={{ width: "auto" }} />
                        <label className="sr-only" htmlFor={`e${e.id}`}>End</label>
                        <input id={`e${e.id}`} name="end" type="datetime-local" defaultValue={local(e.ended_at)} style={{ width: "auto" }} />
                        <button className="btn ghost small">Fix</button>
                      </ActionForm>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
