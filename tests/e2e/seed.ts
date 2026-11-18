import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/** Test fixtures. Uses XTS, the ISO code reserved for testing, so it can never be mistaken for a real price. */

const DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function localEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

export const PASSWORD = "e2e-password-not-secret";
export const USERS = { owner: "owner@e2e.local", support: "support@e2e.local", inventory: "inventory@e2e.local" };

export interface Seeded {
  navy: { slug: string; size: string; variantId: string };
  snap: { slug: string; variantId: string };
  soldout: { slug: string };
}

let usersReady = false;

export async function seed(): Promise<Seeded> {
  const env = { ...localEnv(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(DB) || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("E2E seeding only runs against a local database.");
  }
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    await db.query("begin");
    await db.query(
      "truncate public.orders, public.customers, public.products, public.contact_messages, public.inventory_movements, public.audit_log, public.conversations, public.tasks, public.time_entries, public.purchase_orders, public.suppliers, public.expenses, public.notifications cascade",
    );
    await db.query(`update public.settings set business_name = 'E2E Store', currency = 'XTS', pickup_enabled = true,
      pickup_instructions = 'E2E pickup instructions', delivery_enabled = true, delivery_fee_cents = 500,
      free_delivery_threshold_cents = null, delivery_areas = 'E2E area', returns_policy = null, privacy_policy = null`);
    await db.query("update public.goals set monthly_sales_target_cents = null");
    await db.query("select set_config('pip.stock_write', 'on', true)");
    const product = async (slug: string, name: string, team: string, style: string, price: number, featured: boolean, sizes: [string, number][]) => {
      const { rows } = await db.query(
        "insert into public.products (slug, name, team, style, price_cents, status, featured) values ($1,$2,$3,$4,$5,'active',$6) returning id",
        [slug, name, team, style, price, featured],
      );
      const ids: Record<string, string> = {};
      for (const [i, [size, stock]] of sizes.entries()) {
        const r = await db.query("insert into public.product_variants (product_id, size, stock, sort) values ($1,$2,$3,$4) returning id", [rows[0].id, size, stock, i]);
        ids[size] = r.rows[0].id;
      }
      return ids;
    };
    const navy = await product("e2e-fitted-navy", "E2E Fitted Navy", "Team One", "Fitted", 4500, true, [["7 1/4", 3], ["7 3/8", 0]]);
    const snap = await product("e2e-snapback", "E2E Snapback", "Team Two", "Snapback", 3000, false, [["One size", 1]]);
    await product("e2e-sold-out", "E2E Sold Out", "Team One", "Fitted", 4000, false, [["7", 0]]);
    await db.query("commit");

    if (!usersReady) {
      const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      await db.query("delete from auth.users where email like '%@e2e.local'");
      for (const [role, email] of Object.entries(USERS)) {
        const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
        if (error) throw error;
        await db.query("insert into public.staff (user_id, full_name, email, role) values ($1,$2,$3,$4)", [data.user!.id, `E2E ${role}`, email, role]);
      }
      usersReady = true;
    }
    const res = await fetch("http://localhost:3200/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": env.REVALIDATE_SECRET ?? "" } });
    if (!res.ok) throw new Error("set REVALIDATE_SECRET in .env.local so tests can refresh cached pages");
    return {
      navy: { slug: "e2e-fitted-navy", size: "7 1/4", variantId: navy["7 1/4"] },
      snap: { slug: "e2e-snapback", variantId: snap["One size"] },
      soldout: { slug: "e2e-sold-out" },
    };
  } finally {
    await db.end();
  }
}

export async function sql(query: string, params: unknown[] = []) {
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    return (await db.query(query, params)).rows;
  } finally {
    await db.end();
  }
}

/** Simulates another shopper buying the last ones (stock changes need the stock-write flag). */
export async function setStock(variantId: string, stock: number) {
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('pip.stock_write', 'on', true)");
    await db.query("update public.product_variants set stock = $2 where id = $1", [variantId, stock]);
    await db.query("commit");
  } finally {
    await db.end();
  }
}
