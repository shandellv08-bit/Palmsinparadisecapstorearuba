#!/usr/bin/env node
// Fills a LOCAL database with a realistic, clearly labelled demo business for
// testing: caps with drawn photos, customers, a month of orders, chats, tasks,
// shifts, suppliers, purchase orders, expenses and a goal.
//
//   npm run db:local            (start local Supabase)
//   node scripts/seed-demo.mjs  (wipes and refills the LOCAL database)
//
// It refuses to run against anything that is not localhost. Everything it
// creates says "demo"; none of it is a real product, price, person or order.

import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB) || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_)) {
  console.error("Refusing: the demo only goes into a local database.");
  process.exit(1);
}
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DB });
await db.connect();
const q = (sql, params = []) => db.query(sql, params);
const one = async (sql, params = []) => (await q(sql, params)).rows[0];

export const PASSWORD = "demo-password-123";
const DAY = 864e5;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // repeatable
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

// ---------------------------------------------------------------- wipe
console.log("Wiping local demo data…");
await q(`truncate public.orders, public.customers, public.products, public.contact_messages, public.inventory_movements,
  public.audit_log, public.conversations, public.tasks, public.time_entries, public.purchase_orders, public.suppliers,
  public.expenses, public.notifications cascade`);
await q("delete from public.staff");
await q("delete from auth.users where email like '%@demo.local' or email like '%@e2e.local'");
{
  const { data } = await admin.storage.from("product-photos").list("products", { limit: 1000 });
  for (const dir of data ?? []) {
    const { data: files } = await admin.storage.from("product-photos").list(`products/${dir.name}`, { limit: 100 });
    if (files?.length) await admin.storage.from("product-photos").remove(files.map((f) => `products/${dir.name}/${f.name}`));
  }
}

// ---------------------------------------------------------------- settings
await q(`update public.settings set
  business_name = 'Palms in Paradise Aruba',
  tagline = 'Demo store for testing. Sample caps, prices and orders.',
  announcement = 'DEMO STORE · everything here is sample data for testing, nothing is real',
  about = 'Demo text. Write your story in Store settings.',
  currency = 'AWG',
  phone = 'Demo: 000 0000', whatsapp = 'Demo: 000 0000', email = 'demo@example.com', instagram = '@demo',
  address = 'Demo address, Aruba', opening_hours = 'Demo hours: Monday to Saturday 10:00 to 18:00',
  pickup_enabled = true, pickup_instructions = 'Demo: pickup instructions go here.',
  delivery_enabled = true, delivery_fee_cents = 1000, free_delivery_threshold_cents = 15000,
  delivery_areas = 'Demo: Oranjestad, Noord, Paradera',
  low_stock_threshold = 2,
  returns_policy = 'Demo text. Write your real returns policy in Store settings.',
  privacy_policy = 'Demo text. Write your real privacy policy in Store settings.',
  terms = 'Demo text.'`);
await q("update public.goals set monthly_sales_target_cents = 600000");

// ---------------------------------------------------------------- team
console.log("Creating demo logins…");
const team = {};
for (const [key, name, role] of [
  ["shan", "Shan (owner)", "owner"],
  ["maria", "Maria Demo", "manager"],
  ["jay", "Jay Demo", "inventory"],
  ["kim", "Kim Demo", "support"],
]) {
  const email = `${key}@demo.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await q("insert into public.staff (user_id, full_name, email, role) values ($1,$2,$3,$4)", [data.user.id, name, email, role]);
  team[key] = data.user.id;
}
/** Run SQL as a staff member, the way the dashboard does. */
async function as(who, sql, params = []) {
  await q("begin");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: team[who], role: "authenticated" })]);
  try {
    const r = await q(sql, params);
    await q("commit");
    return r.rows;
  } catch (e) {
    await q("rollback");
    throw e;
  }
}

// ---------------------------------------------------------------- caps
const FITTED = ["6 7/8", "7", "7 1/8", "7 1/4", "7 3/8", "7 1/2", "7 5/8", "7 3/4"];
const caps = [
  { name: "New York 59FIFTY Fitted, Navy", team: "New York", style: "59FIFTY Fitted", colour: "Navy", crown: "#1b2a4a", brim: "#16223d", ink: "#ffffff", mark: "NY", price: 7500, cost: 3200, sizes: FITTED, featured: true, ageDays: 6 },
  { name: "Los Angeles 59FIFTY Fitted, Royal", team: "Los Angeles", style: "59FIFTY Fitted", colour: "Royal blue", crown: "#1d4fa3", brim: "#173f84", ink: "#ffffff", mark: "LA", price: 7500, cost: 3200, sizes: FITTED, featured: true, ageDays: 12 },
  { name: "Chicago 59FIFTY Fitted, Black", team: "Chicago", style: "59FIFTY Fitted", colour: "Black", crown: "#1c1c1e", brim: "#111113", ink: "#d1293d", mark: "C", price: 7500, cost: 3300, sizes: FITTED.slice(1, 7), featured: false, ageDays: 40 },
  { name: "Boston 59FIFTY Fitted, Navy", team: "Boston", style: "59FIFTY Fitted", colour: "Navy and red", crown: "#14213d", brim: "#14213d", ink: "#c8102e", mark: "B", price: 7500, cost: 3200, sizes: FITTED.slice(2, 7), featured: false, ageDays: 55 },
  { name: "San Francisco 59FIFTY Fitted, Black", team: "San Francisco", style: "59FIFTY Fitted", colour: "Black and orange", crown: "#161616", brim: "#f05a28", ink: "#f05a28", mark: "SF", price: 8000, cost: 3500, sizes: FITTED.slice(2, 6), featured: true, ageDays: 3 },
  { name: "Los Angeles 59FIFTY Fitted, All Black", team: "Los Angeles", style: "59FIFTY Fitted", colour: "Black", crown: "#121212", brim: "#121212", ink: "#ffffff", mark: "LA", price: 7500, cost: 3200, sizes: ["7 1/8", "7 1/4", "7 3/8"], featured: false, ageDays: 70, soldOut: true },
  { name: "Atlanta 9FORTY Adjustable, Navy", team: "Atlanta", style: "9FORTY Adjustable", colour: "Navy and red", crown: "#13274f", brim: "#ce1141", ink: "#ce1141", mark: "A", price: 5500, cost: 2200, sizes: ["One size"], featured: false, ageDays: 25 },
  { name: "New York 9FORTY Adjustable, Black", team: "New York", style: "9FORTY Adjustable", colour: "Black", crown: "#1a1a1a", brim: "#1a1a1a", ink: "#ffffff", mark: "NY", price: 5500, cost: 2200, sizes: ["One size"], featured: false, ageDays: 18 },
  { name: "Miami 9FIFTY Snapback, Teal", team: "Miami", style: "9FIFTY Snapback", colour: "Teal and orange", crown: "#00a3ad", brim: "#ef7f1a", ink: "#ffffff", mark: "M", price: 6500, cost: 2700, sizes: ["One size"], featured: true, ageDays: 2 },
  { name: "Houston 9FIFTY Snapback, Navy", team: "Houston", style: "9FIFTY Snapback", colour: "Navy and orange", crown: "#002d62", brim: "#eb6e1f", ink: "#eb6e1f", mark: "H", price: 6500, cost: 2700, sizes: ["One size"], featured: false, ageDays: 33 },
  { name: "Chicago 9FIFTY Snapback, Royal", team: "Chicago", style: "9FIFTY Snapback", colour: "Royal blue", crown: "#0e3386", brim: "#0e3386", ink: "#cc3433", mark: "C", price: 6500, cost: 2700, sizes: ["One size"], featured: false, ageDays: 48 },
];

/** An original front-view cap drawing (and a side view), used instead of photos in the demo. */
function capSvg(c, view) {
  const bg = view === "front" ? ["#e7f1ef", "#efe7d8"] : ["#efe7d8", "#e3edf0"];
  const letters = c.mark.length > 1 ? 112 : 150;
  const front = `
    <path d="M128 352 C128 170 205 92 300 92 C395 92 472 170 472 352 Z" fill="${c.crown}"/>
    <path d="M300 96 L300 352 M300 96 C258 150 232 250 222 352 M300 96 C342 150 368 250 378 352" stroke="rgba(0,0,0,.22)" stroke-width="3" fill="none"/>
    <circle cx="300" cy="94" r="12" fill="${c.crown}" stroke="rgba(0,0,0,.25)" stroke-width="3"/>
    <circle cx="200" cy="190" r="5" fill="rgba(0,0,0,.3)"/><circle cx="400" cy="190" r="5" fill="rgba(0,0,0,.3)"/>
    <text x="300" y="${c.mark.length > 1 ? 278 : 290}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${letters}" fill="${c.ink}" stroke="rgba(0,0,0,.18)" stroke-width="2">${c.mark}</text>
    <path d="M96 352 Q300 316 504 352 Q512 404 300 418 Q88 404 96 352 Z" fill="${c.brim}"/>
    <path d="M96 352 Q300 316 504 352" stroke="rgba(255,255,255,.18)" stroke-width="4" fill="none"/>
    <path d="M140 372 Q300 352 460 372" stroke="rgba(0,0,0,.18)" stroke-width="2" stroke-dasharray="6 7" fill="none"/>`;
  const side = `
    <path d="M150 360 C150 190 240 110 330 110 C430 110 480 210 480 360 Z" fill="${c.crown}"/>
    <path d="M330 112 C300 190 290 280 292 360" stroke="rgba(0,0,0,.22)" stroke-width="3" fill="none"/>
    <circle cx="330" cy="110" r="12" fill="${c.crown}" stroke="rgba(0,0,0,.25)" stroke-width="3"/>
    <circle cx="400" cy="200" r="5" fill="rgba(0,0,0,.3)"/>
    <path d="M60 352 Q160 330 290 352 L290 372 Q160 360 60 378 Z" fill="${c.brim}"/>
    <path d="M150 360 L480 360 L480 372 L150 372 Z" fill="rgba(0,0,0,.25)"/>
    <text x="410" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="34" fill="${c.ink}" opacity=".9">${c.mark}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1600" height="1600">
    <defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient></defs>
    <rect width="600" height="600" fill="url(#g)"/>
    <ellipse cx="300" cy="460" rx="210" ry="22" fill="rgba(6,47,55,.12)"/>
    ${view === "front" ? front : side}
    <text x="300" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="4" fill="rgba(6,47,55,.45)">DEMO IMAGE</text>
  </svg>`;
}

console.log("Drawing cap images…");
const browser = await chromium.launch();
const page = await browser.newPage();
async function webp(svg, size) {
  return page.evaluate(
    async ({ svg, size }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      c.getContext("2d").drawImage(img, 0, 0, size, size);
      return c.toDataURL("image/webp", 0.86).split(",")[1];
    },
    { svg, size },
  );
}

console.log("Adding caps…");
const variants = {}; // name -> [{id,size}]
const productIds = {};
for (const c of caps) {
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { id } = await one(
    `insert into public.products (slug, name, team, style, colour, description, price_cents, status, featured, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,'active',$8, now() - ($9 || ' days')::interval) returning id`,
    [slug, c.name, c.team, c.style, c.colour, `Demo product for testing. ${c.style}, ${c.colour.toLowerCase()}.`, c.price, c.featured, String(c.ageDays)],
  );
  productIds[c.name] = id;
  await q("insert into public.product_costs (product_id, cost_cents) values ($1,$2)", [id, c.cost]);
  const images = [];
  for (const view of ["front", "side"]) {
    const base = `products/${id}/${crypto.randomUUID()}`;
    for (const size of [600, 1600]) {
      const b64 = await webp(capSvg(c, view), size);
      const { error } = await admin.storage.from("product-photos").upload(`${base}-${size}.webp`, Buffer.from(b64, "base64"), { contentType: "image/webp", upsert: true });
      if (error) throw error;
    }
    images.push(base);
  }
  await q("update public.products set images = $2 where id = $1", [id, images]);
  variants[c.name] = [];
  for (const [i, size] of c.sizes.entries()) {
    const { id: vid } = await one("insert into public.product_variants (product_id, size, sort) values ($1,$2,$3) returning id", [id, size, i]);
    variants[c.name].push({ id: vid, size });
    const start = c.soldOut ? 1 : size === "One size" ? 12 : [6, 7, 8].includes(i + 1) ? 2 : 5;
    await as("jay", "select public.adjust_stock($1, $2, 'initial', 'Demo opening count')", [vid, start]);
  }
}
await browser.close();

// ---------------------------------------------------------------- customers and orders
console.log("Placing a month of demo orders…");
const people = ["Ana", "Luis", "Kevin", "Shanaya", "Jurick", "Melissa", "Ryan", "Gisela", "Dwayne", "Kiara", "Rubén", "Natasha", "Edsel", "Yasmin", "Jordy", "Celine"];
const customers = people.map((n, i) => ({ name: `${n} (demo)`, phone: `+297 000 ${String(100 + i).padStart(4, "0")}`, email: i % 3 === 0 ? `${n.toLowerCase().replace("é", "e")}.demo@example.com` : "" }));
const now = Date.now();
const orders = [];
for (let i = 0; i < 46; i++) {
  const who = pick(customers);
  const lines = [];
  const n = rand() < 0.75 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const cap = pick(caps.filter((c) => !c.soldOut));
    const v = pick(variants[cap.name]);
    if (!lines.some((l) => l.variant_id === v.id)) lines.push({ variant_id: v.id, quantity: 1 });
  }
  const delivery = rand() < 0.35;
  try {
    const { r } = await one("select public.place_order($1::jsonb) as r", [
      JSON.stringify({
        customer: { name: who.name, phone: who.phone, email: who.email || null },
        fulfilment: delivery ? "delivery" : "pickup",
        delivery_address: delivery ? "Demo street 1, Oranjestad" : null,
        note: rand() < 0.15 ? "Demo note: please call when ready." : null,
        items: lines,
      }),
    ]);
    // spread over the last 30 days, the newest few today
    const ageMs = i >= 42 ? (46 - i) * 3600_000 : (30 - (i / 42) * 29.5) * DAY * (0.97 + rand() * 0.03);
    orders.push({ id: r.id, age: ageMs, i });
  } catch {
    // a size ran out: that is realistic, skip it
  }
}
for (const o of orders) {
  const at = new Date(now - o.age).toISOString();
  await q("update public.orders set created_at = $2, updated_at = $2 where id = $1", [o.id, at]);
  await q("update public.order_events set created_at = $2 where order_id = $1", [o.id, at]);
  await q("update public.inventory_movements set created_at = $2 where order_id = $1", [o.id, at]);
  if (o.age > 2 * DAY) {
    if (o.i % 13 === 5) {
      await as("kim", "select public.cancel_order($1, true, 'Demo: customer changed their mind')", [o.id]);
    } else {
      await as("kim", "select public.set_order_status($1, 'ready')", [o.id]);
      await as("kim", "select public.set_payment_status($1, 'paid', 'Demo: paid at pickup')", [o.id]);
      await as("kim", "select public.set_order_status($1, 'completed')", [o.id]);
    }
    const later = new Date(now - o.age + 26 * 3600_000).toISOString();
    await q("update public.order_events set created_at = $2 where order_id = $1 and kind <> 'placed'", [o.id, later]);
  } else if (o.age > 20 * 3600_000) {
    await as("kim", "select public.set_order_status($1, 'confirmed', 'Demo: called the customer')", [o.id]);
  }
}
await q("update public.customers set created_at = (select min(created_at) from public.orders o where o.customer_id = customers.id) where exists (select 1 from public.orders o where o.customer_id = customers.id)");
await as("kim", "update public.customers set notes = 'Demo note: prefers WhatsApp, usually size 7 1/4.' where name = 'Ana (demo)'");

// ---------------------------------------------------------------- suppliers and purchasing
console.log("Suppliers, purchase orders and deliveries…");
const { id: supA } = await one("insert into public.suppliers (name, contact_name, phone, email, lead_time_days, notes) values ('Demo Supplier Miami', 'Demo contact', 'Demo: 000 0000', 'supplier-a@example.com', 10, 'Demo: minimum 24 caps, pays by bank transfer.') returning id");
const { id: supB } = await one("insert into public.suppliers (name, contact_name, lead_time_days, notes) values ('Demo Supplier Panama', 'Demo contact', 21, 'Demo: cheaper, slower.') returning id");
const ny = variants["New York 59FIFTY Fitted, Navy"];
const la = variants["Los Angeles 59FIFTY Fitted, Royal"];
// received last week
const { id: po1 } = await one("insert into public.purchase_orders (supplier_id, shipping_cents, expected_on, notes, created_by) values ($1, 6500, current_date - 6, 'Demo order', $2) returning id", [supA, team.shan]);
for (const v of ny.slice(2, 6)) await q("insert into public.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_cents) values ($1,$2,4,3200)", [po1, v.id]);
await as("shan", "select public.set_po_status($1, 'ordered')", [po1]);
for (const r of (await q("select id, quantity_ordered from public.purchase_order_items where po_id = $1", [po1])).rows) {
  await as("jay", "select public.receive_po_item($1, $2)", [r.id, r.quantity_ordered]);
}
await q("update public.purchase_orders set ordered_on = current_date - 16 where id = $1", [po1]);
// on its way: shows up for Jay to receive
const { id: po2 } = await one("insert into public.purchase_orders (supplier_id, shipping_cents, expected_on, notes, created_by) values ($1, 4800, current_date + 3, 'Demo order: restock LA', $2) returning id", [supB, team.shan]);
for (const v of la.slice(2, 6)) await q("insert into public.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_cents) values ($1,$2,3,2900)", [po2, v.id]);
await as("shan", "select public.set_po_status($1, 'ordered')", [po2]);
// a draft
const { id: po3 } = await one("insert into public.purchase_orders (supplier_id, created_by, notes) values ($1, $2, 'Demo draft: snapbacks for December') returning id", [supA, team.maria]);
await q("insert into public.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_cents) values ($1,$2,12,2700)", [po3, variants["Miami 9FIFTY Snapback, Teal"][0].id]);

// ---------------------------------------------------------------- expenses
const month = new Date(now - 4 * 3600_000).toISOString().slice(0, 8);
for (const [day, cat, amt, desc] of [
  ["01", "rent", 120000, "Demo: shop rent"],
  ["03", "marketing", 15000, "Demo: Instagram ads"],
  ["05", "fees", 4500, "Demo: bank fees"],
  ["09", "shipping", 22000, "Demo: freight and duties"],
  ["12", "equipment", 8900, "Demo: display hooks"],
]) {
  const d = `${month}${day}`;
  if (Date.parse(d) <= now) await q("insert into public.expenses (spent_on, category, amount_cents, description, created_by) values ($1,$2,$3,$4,$5)", [d, cat, amt, desc, team.shan]);
}

// ---------------------------------------------------------------- tasks
console.log("Tasks, shifts, chats…");
const task = async (who, title, details, priority, dueDays, assignee) =>
  (await as(who, "select public.create_task($1,$2,$3, current_date + $4::int, $5) as id", [title, details, priority, dueDays, team[assignee]]))[0].id;
const t1 = await task("shan", "Photograph the San Francisco caps", "Demo task. Front and side, on the white table.", "high", 1, "jay");
const t2 = await task("shan", "Answer Instagram DMs about restocks", null, "normal", 0, "kim");
const t3 = await task("maria", "Count the 7 1/4 fitted shelf", "Demo task. Compare with Stock page.", "normal", -1, "jay");
const t4 = await task("shan", "Write the returns policy", "Demo task.", "normal", 5, "shan");
const t5 = await task("kim", "Call back Luis about size 7 5/8", null, "low", 2, "kim");
await as("jay", "select public.set_task_status($1, 'doing')", [t1]);
await as("jay", "select public.add_task_comment($1, 'Demo: half done, need better light.')", [t1]);
await as("kim", "select public.set_task_status($1, 'done')", [t5]);
void t2; void t3; void t4;

// ---------------------------------------------------------------- hours
for (let d = 6; d >= 1; d--) {
  for (const [who, start, len] of [["jay", 10, 6], ["kim", 13, 5]]) {
    if ((d + who.length) % 4 === 0) continue;
    const s = new Date(now - d * DAY);
    s.setUTCHours(start + 4, 0, 0, 0); // Aruba time
    await q("insert into public.time_entries (user_id, started_at, ended_at) values ($1,$2,$3)", [team[who], s.toISOString(), new Date(s.getTime() + len * 3600_000).toISOString()]);
  }
}
await q("insert into public.time_entries (user_id, started_at) values ($1, now() - interval '2 hours 10 minutes')", [team.kim]);

// ---------------------------------------------------------------- chats and contact form
const chat = async (name, contact, msgs, reply) => {
  const { t } = await one("select public.start_chat($1,$2,$3) as t", [name, contact, msgs[0]]);
  for (const m of msgs.slice(1)) await q("select public.chat_send($1,$2)", [t, m]);
  const { id } = await one("select id from public.conversations where public_token = $1", [t]);
  if (reply) await as("kim", "select public.chat_reply($1, $2)", [id, reply]);
  return id;
};
await chat("Melissa (demo)", null, ["Hi! Is the Miami snapback adjustable for small heads?", "It's for my son, he's 12."], null);
const c2 = await chat("Jordy (demo)", "jordy.demo@example.com", ["Do you have New York fitted in 7 5/8?"], "Hi Jordy, yes we have it. Want me to set one aside for pickup?");
await q("select public.chat_send((select public_token from public.conversations where id = $1), 'Yes please, Saturday')", [c2]);
const c3 = await chat("Natasha (demo)", null, ["What time do you close today?"], "Demo reply: we close at 18:00.");
await as("kim", "select public.chat_update($1, 'closed')", [c3]);
await q("select public.submit_contact('Edsel (demo)', 'edsel.demo@example.com', 'Demo message: do you do team orders for a softball club? About 15 caps.')");

// a normal day: only the latest few alerts per person are unread
await q(`update public.notifications n set read_at = now() where id not in (
  select id from (select id, row_number() over (partition by recipient order by id desc) r from public.notifications) x where r <= 4)`);

const counts = await one(`select (select count(*) from public.orders)::int orders, (select count(*) from public.customers)::int customers,
  (select count(*) from public.products)::int products, (select count(*) from public.conversations)::int chats`);
console.log("Demo ready:", counts);
console.log(`Logins (password ${PASSWORD}): shan@demo.local (owner), maria@demo.local (manager), jay@demo.local (inventory), kim@demo.local (customer service)`);
await db.end();

// refresh cached store pages so they show the demo, not whatever was there before
try {
  const res = await fetch(`${process.env.SITE ?? "http://localhost:3000"}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": env.REVALIDATE_SECRET ?? "" } });
  console.log(res.ok ? "Store pages refreshed." : "Start the site, then rerun to refresh cached pages.");
} catch {
  console.log("Site not running yet; pages refresh within 60 seconds once it is.");
}
