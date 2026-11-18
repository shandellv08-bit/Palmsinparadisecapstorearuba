import { ActionForm } from "@/components/admin/ActionForm";
import { createTask, updateTask } from "../../ops";

export interface TaskValues {
  id?: string;
  title?: string;
  details?: string | null;
  priority?: string;
  due_on?: string | null;
  assigned_to?: string | null;
}

export function TaskForm({ t = {}, team, canAssign, me }: { t?: TaskValues; team: { user_id: string; full_name: string }[]; canAssign: boolean; me: string }) {
  return (
    <ActionForm action={t.id ? updateTask : createTask} className="panel" resetOnSuccess={!t.id}>
      {t.id ? <input type="hidden" name="id" value={t.id} /> : null}
      <div className="field">
        <label htmlFor="title">Task</label>
        <input id="title" name="title" type="text" required maxLength={200} defaultValue={t.title} placeholder="e.g. Photograph the new arrivals" />
      </div>
      <div className="field">
        <label htmlFor="details">Details (optional)</label>
        <textarea id="details" name="details" maxLength={4000} defaultValue={t.details ?? ""} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={t.priority ?? "normal"} style={{ width: "auto" }}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="due">Due (optional)</label>
          <input id="due" name="due" type="date" defaultValue={t.due_on ?? ""} style={{ width: "auto", minHeight: 46, border: "1.5px solid var(--line)", borderRadius: 10, padding: ".5rem" }} />
        </div>
        <div className="field">
          <label htmlFor="assignee">For</label>
          {canAssign ? (
            <select id="assignee" name="assignee" defaultValue={t.assigned_to ?? me} style={{ width: "auto" }}>
              {team.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.user_id === me ? `${p.full_name} (me)` : p.full_name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="assignee" value={t.assigned_to ?? me} />
              <p id="assignee" style={{ margin: ".6rem 0" }}>Me</p>
            </>
          )}
        </div>
      </div>
      <button className="btn">{t.id ? "Save task" : "Add task"}</button>
    </ActionForm>
  );
}
