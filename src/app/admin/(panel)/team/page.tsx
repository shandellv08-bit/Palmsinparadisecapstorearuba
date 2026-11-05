import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { areasFor, ROLE_LABELS, ROLES } from "@/lib/engine";
import { ActionForm } from "@/components/admin/ActionForm";
import { addTeamMember, updateTeamMember } from "../../manage";

export const metadata = { title: "Team" };

export default async function Team() {
  const me = await requireStaff("team");
  const sb = await supabaseServer();
  const { data } = await sb.from("staff").select("user_id, full_name, email, role, active").order("created_at");
  const rows = (data ?? []) as { user_id: string; full_name: string; email: string; role: (typeof ROLES)[number]; active: boolean }[];
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
