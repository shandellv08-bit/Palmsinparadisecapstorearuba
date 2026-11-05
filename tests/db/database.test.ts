import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  actAs,
  connect,
  createProduct,
  createStaff,
  createUser,
  expectFail,
  orderPayload,
  stockOf,
} from "./helpers";
import { AREAS, ROLES, deliveryFeeFor, roleCan, transitionAllowed, ORDER_STATUSES } from "@/lib/engine";

let db: Client;

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
  // Known starting point, whatever another test suite left behind (rolled back after each test).
  await db.query(`update public.settings set pickup_enabled = true, delivery_enabled = false,
    delivery_fee_cents = null, free_delivery_threshold_cents = null, currency = null`);
});
afterEach(async () => {
  await db.query("rollback");
});

async function placeOrder(payload: unknown) {
  const { rows } = await db.query("select public.place_order($1::jsonb) as r", [JSON.stringify(payload)]);
  return rows[0].r as { id: string; number: number; token: string; total_cents: number };
}

describe("what customers (anon) can see", () => {
  it("cannot read any private table", async () => {
    await actAs(db, { role: "anon" });
    for (const table of [
      "products",
      "product_costs",
      "product_variants",
      "orders",
      "order_items",
      "order_item_costs",
      "customers",
      "audit_log",
      "staff",
      "contact_messages",
      "inventory_movements",
    ]) {
      const msg = await expectFail(db, `select * from public.${table} limit 1`);
      expect(msg, table).toMatch(/permission denied/);
    }
  });

  it("reads only active products through public_products, with no cost or exact stock", async () => {
    const active = await createProduct(db, { price: 4500, cost: 2000, stock: { "7 1/4": 3, "7 3/8": 0 } });
    const draft = await createProduct(db, { price: 4500, status: "draft", stock: { M: 5 } });
    await actAs(db, { role: "anon" });
    const { rows } = await db.query("select * from public.public_products where slug = any($1)", [
      [active.slug, draft.slug],
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(Object.keys(row)).not.toContain("cost_cents");
    expect(JSON.stringify(row)).not.toContain("2000");
    expect(row.in_stock).toBe(true);
    expect(row.variants).toEqual([
      { id: active.variants["7 1/4"], size: "7 1/4", in_stock: true },
      { id: active.variants["7 3/8"], size: "7 3/8", in_stock: false },
    ]);
    expect(JSON.stringify(row.variants)).not.toMatch(/"stock"/);
  });

  it("cannot call staff functions", async () => {
    await actAs(db, { role: "anon" });
    for (const sql of [
      "select public.adjust_stock(gen_random_uuid(), 1, 'restock')",
      "select public.cancel_order(gen_random_uuid(), true)",
      "select public.set_order_status(gen_random_uuid(), 'ready')",
      "select public.log_audit('x')",
    ]) {
      expect(await expectFail(db, sql)).toMatch(/permission denied/);
    }
  });

  it("can read public settings but not change them", async () => {
    await actAs(db, { role: "anon" });
    const { rows } = await db.query("select pickup_enabled from public.settings");
    expect(rows).toHaveLength(1);
    expect(await expectFail(db, "update public.settings set business_name = 'x'")).toMatch(/permission denied/);
  });

  it("a signed-in non-staff user sees nothing private", async () => {
    const uid = await createUser(db, "stranger@test.local");
    await createProduct(db, { price: 100, cost: 50, stock: { M: 1 } });
    await actAs(db, { role: "authenticated", uid });
    expect((await db.query("select * from public.products")).rows).toHaveLength(0);
    expect((await db.query("select * from public.product_costs")).rows).toHaveLength(0);
    expect((await db.query("select * from public.customers")).rows).toHaveLength(0);
    expect(await expectFail(db, "select public.log_audit('x')")).toMatch(/not_allowed/);
  });
});

describe("place_order", () => {
  it("takes prices from the database, decrements stock and logs movements", async () => {
    const p = await createProduct(db, { price: 4500, cost: 2000, stock: { "7 1/4": 3 } });
    const vid = p.variants["7 1/4"];
    await actAs(db, { role: "anon" });
    const payload = orderPayload([{ variant_id: vid, quantity: 2 }]);
    // a tampered price in the payload is ignored
    (payload.items[0] as Record<string, unknown>).unit_price_cents = 1;
    const r = await placeOrder(payload);
    expect(r.total_cents).toBe(9000);
    expect(r.token).toMatch(/^[0-9a-f]{36}$/);

    await actAs(db, { role: "postgres" });
    expect(await stockOf(db, vid)).toBe(1);
    const mv = await db.query("select change, stock_after, reason from public.inventory_movements where variant_id = $1", [vid]);
    expect(mv.rows).toEqual([{ change: -2, stock_after: 1, reason: "order" }]);
    const cost = await db.query(
      "select c.unit_cost_cents from public.order_item_costs c join public.order_items i on i.id = c.order_item_id where i.order_id = $1",
      [r.id],
    );
    expect(cost.rows[0].unit_cost_cents).toBe(2000);
  });

  it("refuses to oversell and leaves stock untouched", async () => {
    const p = await createProduct(db, { price: 4500, stock: { M: 1, L: 5 } });
    await actAs(db, { role: "anon" });
    const msg = await expectFail(db, "select public.place_order($1::jsonb)", [
      JSON.stringify(orderPayload([
        { variant_id: p.variants.L, quantity: 1 },
        { variant_id: p.variants.M, quantity: 2 },
      ])),
    ]);
    expect(msg).toBe("out_of_stock");
    await actAs(db, { role: "postgres" });
    expect(await stockOf(db, p.variants.M)).toBe(1);
    expect(await stockOf(db, p.variants.L)).toBe(5);
  });

  it("counts repeated lines of the same size together", async () => {
    const p = await createProduct(db, { price: 1000, stock: { M: 3 } });
    await actAs(db, { role: "anon" });
    const msg = await expectFail(db, "select public.place_order($1::jsonb)", [
      JSON.stringify(orderPayload([
        { variant_id: p.variants.M, quantity: 2 },
        { variant_id: p.variants.M, quantity: 2 },
      ])),
    ]);
    expect(msg).toBe("out_of_stock");
  });

  it("refuses drafts, unknown items and bad quantities", async () => {
    const draft = await createProduct(db, { price: 1000, status: "draft", stock: { M: 3 } });
    await actAs(db, { role: "anon" });
    const call = (items: unknown) =>
      expectFail(db, "select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload([]), items })]);
    expect(await call([{ variant_id: draft.variants.M, quantity: 1 }])).toBe("unavailable");
    expect(await call([{ variant_id: "00000000-0000-0000-0000-000000000000", quantity: 1 }])).toBe("unavailable");
    expect(await call([{ variant_id: draft.variants.M, quantity: 0 }])).toBe("invalid_items");
    expect(await call([{ variant_id: draft.variants.M, quantity: 1.5 }])).toBe("invalid_items");
    expect(await call([{ variant_id: draft.variants.M, quantity: 11 }])).toBe("invalid_items");
    expect(await call([])).toBe("invalid_items");
  });

  it("validates the customer", async () => {
    const p = await createProduct(db, { price: 1000, stock: { M: 3 } });
    await actAs(db, { role: "anon" });
    const items = [{ variant_id: p.variants.M, quantity: 1 }];
    const call = (customer: unknown) =>
      expectFail(db, "select public.place_order($1::jsonb)", [JSON.stringify({ ...orderPayload(items), customer })]);
    expect(await call({ name: "", phone: "5550101" })).toBe("invalid_name");
    expect(await call({ name: "A", phone: "12" })).toBe("invalid_phone");
    expect(await call({ name: "A", phone: "5550101", email: "nope" })).toBe("invalid_email");
  });

  it("only delivers when delivery is switched on and priced, and applies the fee rule", async () => {
    const p = await createProduct(db, { price: 3000, stock: { M: 10 } });
    const items = [{ variant_id: p.variants.M, quantity: 1 }];
    await actAs(db, { role: "anon" });
    expect(
      await expectFail(db, "select public.place_order($1::jsonb)", [
        JSON.stringify(orderPayload(items, { fulfilment: "delivery", delivery_address: "Somewhere 1" })),
      ]),
    ).toBe("delivery_unavailable");

    await actAs(db, { role: "postgres" });
    await db.query(
      "update public.settings set delivery_enabled = true, delivery_fee_cents = 750, free_delivery_threshold_cents = 5000",
    );
    await actAs(db, { role: "anon" });
    expect(
      await expectFail(db, "select public.place_order($1::jsonb)", [
        JSON.stringify(orderPayload(items, { fulfilment: "delivery" })),
      ]),
    ).toBe("invalid_address");
    const below = await placeOrder(orderPayload(items, { fulfilment: "delivery", delivery_address: "Somewhere 1" }));
    expect(below.total_cents).toBe(3000 + 750);
    const above = await placeOrder(
      orderPayload([{ variant_id: p.variants.M, quantity: 2 }], { fulfilment: "delivery", delivery_address: "Somewhere 1" }),
    );
    expect(above.total_cents).toBe(6000);
  });

  it("recognises a returning customer by phone number", async () => {
    const p = await createProduct(db, { price: 1000, stock: { M: 10 } });
    const items = [{ variant_id: p.variants.M, quantity: 1 }];
    await actAs(db, { role: "anon" });
    await placeOrder({ ...orderPayload(items), customer: { name: "Ana", phone: "+297 555-0199" } });
    await placeOrder({ ...orderPayload(items), customer: { name: "Ana B", phone: "2975550199" } });
    await actAs(db, { role: "postgres" });
    const { rows } = await db.query("select name from public.customers where phone_key = '2975550199'");
    expect(rows).toEqual([{ name: "Ana" }]);
  });

  it("limits the number of orders per phone per hour", async () => {
    const p = await createProduct(db, { price: 100, stock: { M: 50 } });
    const items = [{ variant_id: p.variants.M, quantity: 1 }];
    await actAs(db, { role: "anon" });
    for (let i = 0; i < 5; i++) await placeOrder(orderPayload(items));
    expect(await expectFail(db, "select public.place_order($1::jsonb)", [JSON.stringify(orderPayload(items))])).toBe(
      "too_many_orders",
    );
  });

  it("shows a receipt by token with no personal data", async () => {
    const p = await createProduct(db, { price: 1000, stock: { M: 2 } });
    await actAs(db, { role: "anon" });
    const r = await placeOrder(orderPayload([{ variant_id: p.variants.M, quantity: 1 }]));
    const { rows } = await db.query("select public.get_order_receipt($1) as r", [r.token]);
    const receipt = rows[0].r;
    expect(receipt.total_cents).toBe(1000);
    expect(JSON.stringify(receipt)).not.toMatch(/Test Customer|555/);
    const bad = await db.query("select public.get_order_receipt($1) as r", ["0".repeat(36)]);
    expect(bad.rows[0].r).toBeNull();
  });
});

describe("staff rules", () => {
  async function newOrder(qty = 2) {
    const p = await createProduct(db, { price: 2000, cost: 900, stock: { M: 5 } });
    await actAs(db, { role: "anon" });
    const r = await placeOrder(orderPayload([{ variant_id: p.variants.M, quantity: qty }]));
    await actAs(db, { role: "postgres" });
    return { order: r, variant: p.variants.M, productId: p.productId };
  }

  it("cancelling with restock returns stock and logs it", async () => {
    const support = await createStaff(db, "support");
    const { order, variant } = await newOrder(2);
    expect(await stockOf(db, variant)).toBe(3);
    await actAs(db, { role: "authenticated", uid: support });
    await db.query("select public.cancel_order($1, true, 'customer changed mind')", [order.id]);
    await actAs(db, { role: "postgres" });
    expect(await stockOf(db, variant)).toBe(5);
    const o = await db.query("select status, cancelled_at from public.orders where id = $1", [order.id]);
    expect(o.rows[0].status).toBe("cancelled");
    expect(o.rows[0].cancelled_at).not.toBeNull();
    const mv = await db.query("select change, reason from public.inventory_movements where order_id = $1 order by id", [order.id]);
    expect(mv.rows).toEqual([
      { change: -2, reason: "order" },
      { change: 2, reason: "cancel" },
    ]);
    const audit = await db.query("select action from public.audit_log where entity_id = $1", [order.id]);
    expect(audit.rows.map((r) => r.action)).toContain("order.cancel");
    await actAs(db, { role: "authenticated", uid: support });
    expect(await expectFail(db, "select public.cancel_order($1, true)", [order.id])).toBe("cannot_cancel");
  });

  it("cancelling without restock leaves stock as it is", async () => {
    const owner = await createStaff(db, "owner");
    const { order, variant } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: owner });
    await db.query("select public.cancel_order($1, false)", [order.id]);
    await actAs(db, { role: "postgres" });
    expect(await stockOf(db, variant)).toBe(4);
  });

  it("enforces order status steps", async () => {
    const owner = await createStaff(db, "owner");
    const { order } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: owner });
    expect(await expectFail(db, "select public.set_order_status($1, 'completed')", [order.id])).toBe("invalid_transition");
    await db.query("select public.set_order_status($1, 'ready')", [order.id]);
    await db.query("select public.set_order_status($1, 'completed')", [order.id]);
    expect(await expectFail(db, "select public.cancel_order($1, true)", [order.id])).toBe("cannot_cancel");
    const ev = await db.query("select kind from public.order_events where order_id = $1 order by id", [order.id]);
    expect(ev.rows.map((r) => r.kind)).toEqual(["placed", "status:ready", "status:completed"]);
  });

  it("customer service can mark paid but not refund", async () => {
    const support = await createStaff(db, "support");
    const { order } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: support });
    await db.query("select public.set_payment_status($1, 'paid')", [order.id]);
    expect(await expectFail(db, "select public.set_payment_status($1, 'refunded')", [order.id])).toBe("not_allowed");
  });

  it("customer service cannot see costs, the audit log, or change stock or settings", async () => {
    const support = await createStaff(db, "support");
    const { order, variant } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: support });
    expect((await db.query("select * from public.orders where id = $1", [order.id])).rows).toHaveLength(1);
    expect((await db.query("select * from public.product_costs")).rows).toHaveLength(0);
    expect((await db.query("select * from public.order_item_costs")).rows).toHaveLength(0);
    expect((await db.query("select * from public.audit_log")).rows).toHaveLength(0);
    expect(await expectFail(db, "select public.adjust_stock($1, 1, 'restock')", [variant])).toBe("not_allowed");
    const upd = await db.query("update public.settings set business_name = 'x' returning id");
    expect(upd.rowCount).toBe(0);
    const prod = await db.query("update public.products set price_cents = 1 returning id");
    expect(prod.rowCount).toBe(0);
  });

  it("stock only changes through adjust_stock, which logs a movement", async () => {
    const inv = await createStaff(db, "inventory");
    const { variant } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: inv });
    expect(await expectFail(db, "update public.product_variants set stock = 99 where id = $1", [variant])).toMatch(
      /adjust_stock/,
    );
    const { rows } = await db.query("select public.adjust_stock($1, 6, 'restock', 'delivery from supplier') as s", [variant]);
    expect(rows[0].s).toBe(10);
    expect(await expectFail(db, "select public.adjust_stock($1, -11, 'adjustment')", [variant])).toBe("negative_stock");
    expect(await expectFail(db, "select public.adjust_stock($1, 1, 'order')", [variant])).toBe("invalid_reason");
    await actAs(db, { role: "postgres" });
    const mv = await db.query("select change, stock_after, reason, actor from public.inventory_movements where variant_id = $1 order by id", [variant]);
    expect(mv.rows.at(-1)).toEqual({ change: 6, stock_after: 10, reason: "restock", actor: inv });
  });

  it("inventory staff can read products but not costs", async () => {
    const inv = await createStaff(db, "inventory");
    const { productId } = await newOrder(1);
    await actAs(db, { role: "authenticated", uid: inv });
    expect((await db.query("select id from public.products where id = $1", [productId])).rows).toHaveLength(1);
    expect((await db.query("select * from public.product_costs where product_id = $1", [productId])).rows).toHaveLength(0);
  });

  it("owner and manager can see costs and the audit log", async () => {
    const { productId } = await newOrder(1);
    for (const role of ["owner", "manager"] as const) {
      const uid = await createStaff(db, role);
      await actAs(db, { role: "authenticated", uid });
      expect((await db.query("select * from public.product_costs where product_id = $1", [productId])).rows).toHaveLength(1);
      await db.query("select public.log_audit('test.event', 'product', $1)", [productId]);
      expect((await db.query("select * from public.audit_log where action = 'test.event'")).rows.length).toBeGreaterThan(0);
      await actAs(db, { role: "postgres" });
    }
  });

  it("an inactive staff member has no access", async () => {
    const uid = await createStaff(db, "owner");
    await db.query("update public.staff set active = false where user_id = $1", [uid]);
    await createProduct(db, { price: 100, stock: { M: 1 } });
    await actAs(db, { role: "authenticated", uid });
    expect((await db.query("select * from public.products")).rows).toHaveLength(0);
  });
});

describe("database and app rules agree", () => {
  it("role matrix", async () => {
    for (const role of ROLES) {
      for (const area of AREAS) {
        const { rows } = await db.query("select public.role_can($1::public.staff_role, $2) as ok", [role, area]);
        expect(rows[0].ok, `${role}/${area}`).toBe(roleCan(role, area));
      }
    }
  });

  it("order status transitions", async () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const { rows } = await db.query("select public.order_transition_allowed($1, $2) as ok", [from, to]);
        expect(rows[0].ok, `${from}->${to}`).toBe(transitionAllowed(from, to));
      }
    }
  });

  it("delivery fee", async () => {
    const cases: [number, number | null, number | null][] = [
      [4000, 500, 5000],
      [5000, 500, 5000],
      [100, null, null],
      [100, 300, null],
      [0, 300, 0],
    ];
    for (const [sub, fee, thr] of cases) {
      const { rows } = await db.query("select public.delivery_fee_for($1, $2, $3) as f", [sub, fee, thr]);
      expect(rows[0].f).toBe(deliveryFeeFor(sub, fee, thr));
    }
  });
});

describe("contact form", () => {
  it("anon can submit a valid message but not read messages", async () => {
    await actAs(db, { role: "anon" });
    await db.query("select public.submit_contact('Ana', 'ana@example.com', 'Do you have size 7 1/2?')");
    expect(await expectFail(db, "select public.submit_contact('', 'x', 'y')")).toBe("invalid_message");
    expect(await expectFail(db, "select * from public.contact_messages")).toMatch(/permission denied/);
  });
});
