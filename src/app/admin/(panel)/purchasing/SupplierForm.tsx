import { ActionForm } from "@/components/admin/ActionForm";
import { saveSupplier } from "../../ops";

export interface Supplier {
  id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; website: string | null; lead_time_days: number | null; notes: string | null;
}

export function SupplierForm({ s }: { s?: Supplier }) {
  const f = (id: keyof Supplier, label: string, max: number, type = "text") => (
    <div className="field">
      <label htmlFor={`sup-${id}`}>{label}</label>
      <input id={`sup-${id}`} name={id} type={type} maxLength={max} defaultValue={(s?.[id] as string | number | null) ?? ""} required={id === "name"} />
    </div>
  );
  return (
    <ActionForm action={saveSupplier} className="panel" resetOnSuccess={!s}>
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <div className="two-col" style={{ gap: "0 1rem" }}>
        {f("name", "Supplier name", 120)}
        {f("contact_name", "Contact person", 120)}
        {f("phone", "Phone", 40, "tel")}
        {f("email", "Email", 254, "email")}
        {f("website", "Website", 200)}
        <div className="field">
          <label htmlFor="sup-lead">Lead time (days from order to arrival)</label>
          <input id="sup-lead" name="lead_time_days" type="number" min={0} max={365} defaultValue={s?.lead_time_days ?? ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="sup-notes">Notes (terms, minimum order, how to pay)</label>
        <textarea id="sup-notes" name="notes" maxLength={4000} defaultValue={s?.notes ?? ""} />
      </div>
      <button className="btn">{s ? "Save supplier" : "Add supplier"}</button>
    </ActionForm>
  );
}
