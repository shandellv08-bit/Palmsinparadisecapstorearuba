import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/engine";
import { SETTINGS_COLUMNS, type Settings } from "@/lib/settings";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveSettings } from "../../manage";

export const metadata = { title: "Store settings" };

const plain = (c: number | null) => (c === null ? "" : formatMoney(c, null).replace(/,/g, ""));

function F({ id, label, s, hint, area = false, max }: { id: keyof Settings; label: string; s: Settings; hint?: string; area?: boolean; max: number }) {
  const v = (s[id] as string | null) ?? "";
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {area ? <textarea id={id} name={id} defaultValue={v} maxLength={max} /> : <input id={id} name={id} type="text" defaultValue={v} maxLength={max} />}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export default async function SettingsPage() {
  await requireStaff("settings");
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single();
  const s = data as unknown as Settings;
  return (
    <>
      <h1>Store settings</h1>
      <p className="muted">Anything left empty shows as &quot;not set&quot; on the store. Nothing is filled in for you.</p>
      <ActionForm action={saveSettings}>
        <fieldset>
          <legend>Business</legend>
          <F id="business_name" label="Business name" s={s} max={120} />
          <F id="tagline" label="Short line under the name" s={s} max={200} />
          <F id="announcement" label="Announcement strip at the top of the store" s={s} max={200} hint="Optional. Leave empty to hide it. Example: what is new this week. Only write things that are true." />
          <F id="about" label="About (your story)" s={s} area max={4000} />
          <F id="currency" label="Currency" s={s} max={3} hint="Three letters, for example AWG or USD. All prices are in this currency." />
        </fieldset>
        <fieldset>
          <legend>Contact</legend>
          <F id="phone" label="Phone" s={s} max={40} />
          <F id="whatsapp" label="WhatsApp" s={s} max={40} />
          <F id="email" label="Email" s={s} max={254} />
          <F id="instagram" label="Instagram" s={s} max={60} />
          <F id="address" label="Address" s={s} max={300} />
          <F id="opening_hours" label="Opening hours" s={s} area max={600} />
        </fieldset>
        <fieldset>
          <legend>Pickup</legend>
          <label className="choice">
            <input type="checkbox" name="pickup_enabled" defaultChecked={s.pickup_enabled} /> Customers can pick up orders
          </label>
          <F id="pickup_instructions" label="Pickup instructions" s={s} area max={1000} />
        </fieldset>
        <fieldset>
          <legend>Delivery</legend>
          <label className="choice">
            <input type="checkbox" name="delivery_enabled" defaultChecked={s.delivery_enabled} /> Offer delivery
          </label>
          <div className="field">
            <label htmlFor="delivery_fee_cents">Delivery fee</label>
            <input id="delivery_fee_cents" name="delivery_fee_cents" type="text" inputMode="decimal" defaultValue={plain(s.delivery_fee_cents)} />
          </div>
          <div className="field">
            <label htmlFor="free_delivery_threshold_cents">Free delivery from (optional)</label>
            <input id="free_delivery_threshold_cents" name="free_delivery_threshold_cents" type="text" inputMode="decimal" defaultValue={plain(s.free_delivery_threshold_cents)} />
          </div>
          <F id="delivery_areas" label="Areas you deliver to" s={s} area max={1000} />
        </fieldset>
        <fieldset>
          <legend>Stock</legend>
          <div className="field">
            <label htmlFor="low_stock_threshold">Warn when a size has this many or fewer left</label>
            <input id="low_stock_threshold" name="low_stock_threshold" type="number" min={0} max={1000} defaultValue={s.low_stock_threshold} />
          </div>
        </fieldset>
        <fieldset>
          <legend>Policies</legend>
          <F id="returns_policy" label="Returns policy" s={s} area max={8000} />
          <F id="privacy_policy" label="Privacy policy" s={s} area max={8000} />
          <F id="terms" label="Terms" s={s} area max={8000} />
        </fieldset>
        <button className="btn" type="submit">
          Save settings
        </button>
      </ActionForm>
    </>
  );
}
