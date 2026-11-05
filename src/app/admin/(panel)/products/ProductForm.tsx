import { ActionForm } from "@/components/admin/ActionForm";
import { formatMoney } from "@/lib/engine";
import { saveProduct } from "../../manage";

export interface ProductFormValues {
  id?: string;
  name?: string;
  slug?: string;
  team?: string | null;
  style?: string | null;
  colour?: string | null;
  description?: string | null;
  price_cents?: number;
  status?: string;
  featured?: boolean;
  cost_cents?: number | null;
}

const plain = (c: number | null | undefined) => (c === null || c === undefined ? "" : formatMoney(c, null).replace(/,/g, ""));

export function ProductForm({ p = {}, showCost }: { p?: ProductFormValues; showCost: boolean }) {
  return (
    <ActionForm action={saveProduct} className="panel">
      <input type="hidden" name="id" value={p.id ?? ""} />
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required maxLength={120} defaultValue={p.name} />
      </div>
      <div className="two-col" style={{ gap: "0 1rem" }}>
        <div className="field">
          <label htmlFor="team">Team</label>
          <input id="team" name="team" type="text" maxLength={80} defaultValue={p.team ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="style">Style</label>
          <input id="style" name="style" type="text" maxLength={80} defaultValue={p.style ?? ""} placeholder="e.g. 59FIFTY fitted" />
        </div>
        <div className="field">
          <label htmlFor="colour">Colour</label>
          <input id="colour" name="colour" type="text" maxLength={60} defaultValue={p.colour ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="slug">Web address</label>
          <input id="slug" name="slug" type="text" maxLength={80} defaultValue={p.slug ?? ""} aria-describedby="slug-hint" />
          <p id="slug-hint" className="hint">Leave empty to make one from the name.</p>
        </div>
        <div className="field">
          <label htmlFor="price">Selling price</label>
          <input id="price" name="price" type="text" inputMode="decimal" required defaultValue={plain(p.price_cents)} />
        </div>
        {showCost ? (
          <div className="field">
            <label htmlFor="cost">Your cost per cap</label>
            <input id="cost" name="cost" type="text" inputMode="decimal" defaultValue={plain(p.cost_cents)} aria-describedby="cost-hint" />
            <p id="cost-hint" className="hint">Private. Only owner and manager see this. Leave empty if unknown.</p>
          </div>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={4000} defaultValue={p.description ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="sizes">{p.id ? "Add sizes" : "Sizes"}</label>
        <input id="sizes" name="sizes" type="text" maxLength={400} placeholder="7 1/8, 7 1/4, 7 3/8 or One size" aria-describedby="sizes-hint" />
        <p id="sizes-hint" className="hint">Separate with commas. Stock starts at 0; add stock below or on the Stock page.</p>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={p.status ?? "draft"}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (on the store)</option>
            <option value="archived">Archived (hidden)</option>
          </select>
        </div>
        <label className="choice">
          <input type="checkbox" name="featured" defaultChecked={p.featured} /> Featured on the home page
        </label>
      </div>
      <button className="btn" type="submit">
        {p.id ? "Save changes" : "Create product"}
      </button>
    </ActionForm>
  );
}
