import { Client } from "pg";
import { randomUUID } from "node:crypto";

/**
 * Database tests run against a real Postgres with the migrations applied:
 * either the local Supabase stack (default URL below) or a plain Postgres
 * prepared by scripts/test-db.sh. Each test runs inside a transaction that is
 * rolled back, so tests never leave data behind.
 */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Database tests need Postgres at ${DATABASE_URL}. Start one with "npm run db:local" ` +
        `(Supabase, needs Docker) or "bash scripts/test-db.sh" (plain Postgres). ${(e as Error).message}`,
    );
  }
  return client;
}

export type Who = { role: "anon" } | { role: "authenticated"; uid: string } | { role: "postgres" };

/** Switch the current transaction to act as a given caller, the way PostgREST does. */
export async function actAs(db: Client, who: Who) {
  await db.query("reset role");
  if (who.role === "postgres") {
    await db.query("select set_config('request.jwt.claims', '', true)");
    return;
  }
  const claims = who.role === "anon" ? { role: "anon" } : { role: "authenticated", sub: who.uid };
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await db.query(`set local role ${who.role}`);
}

/** Runs a statement that must fail, inside a savepoint so the test can continue. */
export async function expectFail(db: Client, sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint expect_fail");
  try {
    await db.query(sql, params);
  } catch (e) {
    await db.query("rollback to savepoint expect_fail");
    return (e as Error).message;
  }
  await db.query("rollback to savepoint expect_fail");
  throw new Error(`expected failure but succeeded: ${sql}`);
}

export async function createUser(db: Client, email: string): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

export async function createStaff(db: Client, role: "owner" | "manager" | "inventory" | "support") {
  const uid = await createUser(db, `${role}-${randomUUID().slice(0, 8)}@test.local`);
  await db.query("insert into public.staff (user_id, full_name, email, role) values ($1, $2, $3, $4)", [
    uid,
    `Test ${role}`,
    `${role}@test.local`,
    role,
  ]);
  return uid;
}

/** Inserts a product with sizes and stock, as the database owner. */
export async function createProduct(
  db: Client,
  opts: { price: number; cost?: number; status?: "draft" | "active" | "archived"; stock: Record<string, number> },
) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const { rows } = await db.query(
    "insert into public.products (slug, name, price_cents, status) values ($1, $2, $3, $4) returning id",
    [slug, `Test cap ${slug}`, opts.price, opts.status ?? "active"],
  );
  const productId: string = rows[0].id;
  if (opts.cost !== undefined) {
    await db.query("insert into public.product_costs (product_id, cost_cents) values ($1, $2)", [productId, opts.cost]);
  }
  await db.query("select set_config('pip.stock_write', 'on', true)");
  const variants: Record<string, string> = {};
  let sort = 0;
  for (const [size, stock] of Object.entries(opts.stock)) {
    const r = await db.query(
      "insert into public.product_variants (product_id, size, stock, sort) values ($1, $2, $3, $4) returning id",
      [productId, size, stock, sort++],
    );
    variants[size] = r.rows[0].id;
  }
  await db.query("select set_config('pip.stock_write', '', true)");
  return { productId, slug, variants };
}

export async function stockOf(db: Client, variantId: string): Promise<number> {
  const { rows } = await db.query("select stock from public.product_variants where id = $1", [variantId]);
  return rows[0].stock;
}

export function orderPayload(items: { variant_id: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  return {
    customer: { name: "Test Customer", phone: "+297 555 0101" },
    fulfilment: "pickup",
    items,
    ...extra,
  };
}
