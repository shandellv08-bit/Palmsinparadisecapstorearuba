import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { actAs, connect, createProduct, createStaff, expectFail, orderPayload, stockOf } from "./helpers";

let db: Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
  await db.query("update public.settings set pickup_enabled = true, delivery_enabled = false, low_stock_threshold = 2");
});
afterEach(async () => {
  await db.query("rollback");
});

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const all = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;
const notesFor = (uid: string) => all("select kind, title, link from public.notifications where recipient = $1 order by id", [uid]);

describe("live chat", () => {
  it("customer starts and continues a chat; staff reply takes it over", async () => {
    const support = await createStaff(db, "support");
    const inv = await createStaff(db, "inventory");
    await actAs(db, { role: "anon" });
    const { t: token } = await one("select public.start_chat('Ana', 'ana@example.com', 'Do you have 7 1/2?') as t");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    await db.query("select public.chat_send($1, 'Navy please')", [token]);
    expect(await expectFail(db, "select * from public.conversations")).toMatch(/permission denied/);

    await actAs(db, { role: "postgres" });
    expect((await notesFor(support)).map((n) => n.kind)).toContain("chat.new");
    expect(await notesFor(inv)).toEqual([]); // inventory staff do not handle chat

    await actAs(db, { role: "authenticated", uid: support });
    const conv = await one("select id, needs_human, unread_by_staff from public.conversations");
    expect(conv).toMatchObject({ needs_human: true, unread_by_staff: true });
    await db.query("select public.chat_reply($1, 'Yes, two left in navy.')", [conv.id]);
    const after = await one("select needs_human, ai_enabled, assigned_to, unread_by_staff from public.conversations");
    expect(after).toEqual({ needs_human: false, ai_enabled: false, assigned_to: support, unread_by_staff: false });

    await actAs(db, { role: "anon" });
    const { r } = await one("select public.chat_fetch($1, 0) as r", [token]);
    expect(r.messages.map((m: { sender: string }) => m.sender)).toEqual(["customer", "customer", "staff"]);
    expect(r.messages[2].staff_name).toBe("Test");
    expect(JSON.stringify(r)).not.toContain(support); // no staff ids leak
    const { r: newer } = await one("select public.chat_fetch($1, $2) as r", [token, r.messages[1].id]);
    expect(newer.messages).toHaveLength(1);
  });

  it("rejects unknown tokens, empty and flooding messages", async () => {
    await actAs(db, { role: "anon" });
    expect(await expectFail(db, "select public.chat_send($1, 'hi')", ["0".repeat(48)])).toBe("not_found");
    expect((await one("select public.chat_fetch('nope') as r")).r).toBeNull();
    const { t } = await one("select public.start_chat('Bo', null, 'hello') as t");
    expect(await expectFail(db, "select public.chat_send($1, '   ')", [t])).toBe("invalid_message");
    for (let i = 0; i < 14; i++) await db.query("select public.chat_send($1, 'x')", [t]);
    expect(await expectFail(db, "select public.chat_send($1, 'x')", [t])).toBe("slow_down");
  });

  it("closing adds a note and a new customer message reopens", async () => {
    const support = await createStaff(db, "support");
    await actAs(db, { role: "anon" });
    const { t } = await one("select public.start_chat('Cy', null, 'hello') as t");
    await actAs(db, { role: "authenticated", uid: support });
    const { id } = await one("select id from public.conversations");
    await db.query("select public.chat_update($1, 'closed')", [id]);
    expect((await one("select status from public.conversations")).status).toBe("closed");
    await actAs(db, { role: "anon" });
    await db.query("select public.chat_send($1, 'one more thing')", [t]);
    await actAs(db, { role: "postgres" });
    expect((await one("select status from public.conversations")).status).toBe("open");
  });
});

describe("notifications", () => {
  it("new orders, sold out and low stock notify the right people once", async () => {
    const owner = await createStaff(db, "owner");
    const support = await createStaff(db, "support");
    const inv = await createStaff(db, "inventory");
    const p = await createProduct(db, { price: 1000, stock: { M: 4 } });
    await actAs(db, { role: "anon" });
    await db.query("select public.place_order($1::jsonb)", [JSON.stringify(orderPayload([{ variant_id: p.variants.M, quantity: 2 }]))]);
    await db.query("select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload([{ variant_id: p.variants.M, quantity: 1 }]), customer: { name: "B", phone: "5550202" } })]);
    await db.query("select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload([{ variant_id: p.variants.M, quantity: 1 }]), customer: { name: "C", phone: "5550303" } })]);
    await actAs(db, { role: "postgres" });
    const kinds = async (uid: string) => (await notesFor(uid)).map((n) => n.kind);
    expect(await kinds(support)).toEqual(["order.new", "order.new", "order.new"]); // support: orders but not stock
    expect(await kinds(inv)).toEqual(["order.new", "stock.low", "order.new", "order.new", "stock.out"]);
    expect((await kinds(owner)).filter((k) => k.startsWith("stock"))).toEqual(["stock.low", "stock.out"]);
  });

  it("people read only their own and can mark them read", async () => {
    const a = await createStaff(db, "owner");
    const b = await createStaff(db, "support");
    await db.query("select public.notify_user($1, 'x', 'For A', '/admin', 'k1')", [a]);
    await db.query("select public.notify_user($1, 'x', 'For A again', '/admin', 'k1')", [a]); // duplicate key ignored
    await db.query("select public.notify_user($1, 'x', 'For B', '/admin', 'k1')", [b]);
    await actAs(db, { role: "authenticated", uid: b });
    expect((await all("select title from public.notifications")).map((r) => r.title)).toEqual(["For B"]);
    await db.query("select public.mark_notifications_read()");
    expect((await one("select count(*)::int as n from public.notifications where read_at is null")).n).toBe(0);
    await actAs(db, { role: "authenticated", uid: a });
    expect((await one("select count(*)::int as n from public.notifications where read_at is null")).n).toBe(1);
    expect(await expectFail(db, "select public.notify_user($1, 'x', 'spam', '/admin', 'k2')", [b])).toMatch(/permission denied/);
  });
});

describe("tasks", () => {
  it("leads assign to anyone, workers only to themselves, and see only their own", async () => {
    const owner = await createStaff(db, "owner");
    const w1 = await createStaff(db, "support");
    const w2 = await createStaff(db, "inventory");
    await actAs(db, { role: "authenticated", uid: owner });
    const { id: t1 } = await one("select public.create_task('Count stock', null, 'high', null, $1) as id", [w2]);
    await db.query("select public.create_task('Call supplier', null, 'normal', null, null)");
    await actAs(db, { role: "authenticated", uid: w1 });
    expect(await expectFail(db, "select public.create_task('x', null, 'low', null, $1)", [w2])).toBe("not_allowed");
    await db.query("select public.create_task('Reply to DMs', null, 'low', null, null)");
    expect((await all("select title from public.tasks")).map((r) => r.title)).toEqual(["Reply to DMs"]);
    expect(await expectFail(db, "select public.set_task_status($1, 'done')", [t1])).toBe("not_allowed");

    await actAs(db, { role: "authenticated", uid: w2 });
    expect((await all("select title from public.tasks")).map((r) => r.title)).toEqual(["Count stock"]);
    await db.query("select public.add_task_comment($1, 'Started, halfway')", [t1]);
    await db.query("select public.set_task_status($1, 'done')", [t1]);
    expect(await expectFail(db, "select public.update_task($1, 'x', null, 'low', null, $2)", [t1, w2])).toBe("not_allowed");

    await actAs(db, { role: "postgres" });
    expect((await notesFor(w2)).map((n) => n.kind)).toEqual(["task.assigned"]);
    expect((await notesFor(owner)).map((n) => n.kind)).toEqual(["task.comment", "task.done"]);
    const ev = await all("select kind from public.task_events where task_id = $1 order by id", [t1]);
    expect(ev.map((e) => e.kind)).toEqual(["created", "status"]);
    await actAs(db, { role: "authenticated", uid: owner });
    expect((await one("select count(*)::int as n from public.tasks")).n).toBe(3);
  });
});

describe("hours", () => {
  it("clock in once, clock out, see own hours; leads see everyone", async () => {
    const owner = await createStaff(db, "owner");
    const w = await createStaff(db, "support");
    await actAs(db, { role: "authenticated", uid: w });
    expect(await expectFail(db, "select public.clock_out()")).toBe("not_clocked_in");
    await db.query("select public.clock_in()");
    expect(await expectFail(db, "select public.clock_in()")).toBe("already_clocked_in");
    await db.query("select public.clock_out('closed the shop')");
    expect((await all("select note from public.time_entries")).map((r) => r.note)).toEqual(["closed the shop"]);
    expect(await expectFail(db, "select public.fix_time_entry(1, now(), now())")).toBe("not_allowed");
    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("select public.clock_in()");
    expect((await one("select count(*)::int as n from public.time_entries")).n).toBe(2);
    const { id } = await one("select id from public.time_entries where user_id = $1", [w]);
    await db.query("select public.fix_time_entry($1, now() - interval '8 hours', now())", [id]);
    await actAs(db, { role: "authenticated", uid: w });
    expect((await one("select count(*)::int as n from public.time_entries")).n).toBe(1);
  });
});

describe("purchasing", () => {
  async function poWith(qty: number, cost = 1500) {
    const owner = await createStaff(db, "owner");
    const p = await createProduct(db, { price: 4000, stock: { M: 1 } });
    await actAs(db, { role: "authenticated", uid: owner });
    const { id: sup } = await one("insert into public.suppliers (name, lead_time_days) values ('Test supplier', 14) returning id");
    const { id: po } = await one("insert into public.purchase_orders (supplier_id, created_by) values ($1, $2) returning id", [sup, owner]);
    const { id: item } = await one(
      "insert into public.purchase_order_items (po_id, variant_id, quantity_ordered, unit_cost_cents) values ($1, $2, $3, $4) returning id",
      [po, p.variants.M, qty, cost],
    );
    await actAs(db, { role: "postgres" });
    return { owner, po, item, variant: p.variants.M };
  }

  it("receiving adds stock, logs the movement and completes the order", async () => {
    const { po, item, variant } = await poWith(5);
    const inv = await createStaff(db, "inventory");
    await actAs(db, { role: "authenticated", uid: inv });
    expect(await expectFail(db, "select public.receive_po_item($1, 1)", [item])).toBe("not_receivable"); // still a draft
    expect(await all("select * from public.purchase_orders")).toEqual([]); // inventory cannot read purchase orders
    await actAs(db, { role: "postgres" });
    const owner = (await one("select created_by from public.purchase_orders where id = $1", [po])).created_by;
    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("select public.set_po_status($1, 'ordered')", [po]);

    await actAs(db, { role: "authenticated", uid: inv });
    const rows = await all("select * from public.incoming_deliveries");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("unit_cost_cents");
    expect(JSON.stringify(rows)).not.toContain("1500");
    expect((await all("select * from public.purchase_order_items"))).toEqual([]); // costs hidden from inventory
    await db.query("select public.receive_po_item($1, 3)", [item]);
    expect(await expectFail(db, "select public.receive_po_item($1, 3)", [item])).toBe("invalid_quantity");
    await actAs(db, { role: "postgres" });
    expect(await stockOf(db, variant)).toBe(4);
    expect((await one("select status from public.purchase_orders where id = $1", [po])).status).toBe("partly_received");
    await actAs(db, { role: "authenticated", uid: inv });
    await db.query("select public.receive_po_item($1, 2)", [item]);
    await actAs(db, { role: "postgres" });
    expect((await one("select status from public.purchase_orders where id = $1", [po])).status).toBe("received");
    const mv = await all("select change, reason, note from public.inventory_movements where variant_id = $1 order by id", [variant]);
    expect(mv.slice(-2)).toEqual([
      { change: 3, reason: "restock", note: expect.stringMatching(/^PO-\d+$/) },
      { change: 2, reason: "restock", note: expect.stringMatching(/^PO-\d+$/) },
    ]);
  });

  it("lines are locked once ordered, and support staff cannot see purchasing", async () => {
    const { po, item, owner } = await poWith(2);
    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("select public.set_po_status($1, 'ordered')", [po]);
    const upd = await db.query("update public.purchase_order_items set quantity_ordered = 99 where id = $1", [item]);
    expect(upd.rowCount).toBe(0);
    expect(await expectFail(db, "select public.set_po_status($1, 'draft')", [po])).toBe("invalid_transition");
    const support = await createStaff(db, "support");
    await actAs(db, { role: "authenticated", uid: support });
    expect(await all("select * from public.suppliers")).toEqual([]);
    expect(await all("select * from public.incoming_deliveries")).toEqual([]);
    expect(await expectFail(db, "select public.receive_po_item($1, 1)", [item])).toBe("not_allowed");
  });
});

describe("expenses and customer care", () => {
  it("the sales goal is private to owner and manager", async () => {
    const owner = await createStaff(db, "owner");
    const support = await createStaff(db, "support");
    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("update public.goals set monthly_sales_target_cents = 500000");
    expect((await one("select monthly_sales_target_cents as t from public.goals")).t).toBe(500000);
    await actAs(db, { role: "authenticated", uid: support });
    expect(await all("select * from public.goals")).toEqual([]);
    await actAs(db, { role: "anon" });
    expect(await expectFail(db, "select * from public.goals")).toMatch(/permission denied/);
    expect(JSON.stringify(await all("select * from public.settings"))).not.toContain("500000");
  });

  it("only owner and manager see expenses", async () => {
    const mgr = await createStaff(db, "manager");
    const inv = await createStaff(db, "inventory");
    await actAs(db, { role: "authenticated", uid: mgr });
    await db.query("insert into public.expenses (category, amount_cents, description, created_by) values ('marketing', 2500, 'Flyers', $1)", [mgr]);
    expect((await all("select * from public.expenses"))).toHaveLength(1);
    await actAs(db, { role: "authenticated", uid: inv });
    expect(await all("select * from public.expenses")).toEqual([]);
    expect(await expectFail(db, "insert into public.expenses (category, amount_cents, description) values ('other', 1, 'x')")).toMatch(/row-level security/);
  });

  it("anonymise keeps the order but removes the person; merge moves orders", async () => {
    const owner = await createStaff(db, "owner");
    const support = await createStaff(db, "support");
    const p = await createProduct(db, { price: 1000, stock: { M: 5 } });
    await actAs(db, { role: "anon" });
    await db.query("select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload([{ variant_id: p.variants.M, quantity: 1 }]), customer: { name: "Ana", phone: "5551111", email: "ana@example.com" } })]);
    await db.query("select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload([{ variant_id: p.variants.M, quantity: 1 }]), customer: { name: "Ana B", phone: "5552222" } })]);
    await actAs(db, { role: "postgres" });
    const a = (await one("select id from public.customers where phone_key = '5551111'")).id;
    const b = (await one("select id from public.customers where phone_key = '5552222'")).id;

    await actAs(db, { role: "authenticated", uid: support });
    expect(await expectFail(db, "select public.merge_customers($1, $2)", [a, b])).toBe("not_allowed");
    expect(await expectFail(db, "select public.anonymise_customer($1)", [a])).toBe("not_allowed");

    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("select public.merge_customers($1, $2)", [a, b]);
    expect((await one("select count(*)::int as n from public.orders where customer_id = $1", [a])).n).toBe(2);
    expect((await one("select notes from public.customers where id = $1", [a])).notes).toContain("5552222");
    await db.query("select public.anonymise_customer($1)", [a]);
    const c = await one("select name, phone, email, phone_key from public.customers where id = $1", [a]);
    expect(c).toEqual({ name: "Removed", phone: null, email: null, phone_key: null });
    expect((await one("select count(*)::int as n from public.orders where customer_id = $1", [a])).n).toBe(2);
  });
});
