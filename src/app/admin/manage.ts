"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { staffFor } from "@/lib/auth";
import { isLive, PHOTO_BUCKET } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseMoneyToCents, roleCan, slugify, ROLES, type Area } from "@/lib/engine";

/**
 * Every admin write lives here. Each one:
 * 1. checks the caller's role for the area (staffFor),
 * 2. validates input with zod,
 * 3. writes through the caller's own Supabase session so Postgres row-level
 *    security checks it again (the service role is used only for logins and
 *    storage signing, after step 1),
 * 4. writes to audit_log when it matters.
 */

export interface ActionResult {
  ok?: boolean;
  error?: string;
  message?: string;
  at?: number;
}

const ok = (message?: string): ActionResult => ({ ok: true, message, at: Date.now() });
const fail = (error: string): ActionResult => ({ error });
const DENIED = fail("You do not have access to do that.");

async function guard(area: Area) {
  if (!isLive()) return null;
  return staffFor(area);
}

async function audit(action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("log_audit", { p_action: action, p_entity: entity, p_entity_id: entityId, p_details: details });
  if (error) console.error("audit failed", action);
}

function dbError(message: string | undefined): string {
  switch (message) {
    case "not_allowed":
      return DENIED.error!;
    case "negative_stock":
      return "Stock cannot go below zero.";
    case "invalid_transition":
      return "That status change is not allowed from the current status.";
    case "cannot_cancel":
      return "This order can no longer be cancelled.";
    default:
      return "That did not save. Try again.";
  }
}

const str = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));
const uuid = z.string().uuid();

// ---------------------------------------------------------------- auth

export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!isLive()) return fail("No database is connected, so there is nothing to sign in to.");
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(1).max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return fail("Enter your email and password.");
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return fail("Email or password is not correct.");
  const { data: staff } = await sb.from("staff").select("active").eq("user_id", data.user.id).maybeSingle();
  if (!staff?.active) {
    await sb.auth.signOut();
    return fail("This login is not an active staff account.");
  }
  redirect("/admin");
}

export async function signOut() {
  if (isLive()) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect("/admin/login");
}

// ---------------------------------------------------------------- products

const productSchema = z.object({
  id: z.union([z.literal(""), uuid]),
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z.string().trim().max(80),
  team: str(80),
  style: str(80),
  colour: str(60),
  description: str(4000),
  price: z.string(),
  cost: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]),
  featured: z.boolean(),
  sizes: z.string().max(400),
});

export async function saveProduct(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const staff = await guard("products");
  if (!staff) return DENIED;
  const parsed = productSchema.safeParse({
    id: form.get("id") ?? "",
    name: form.get("name") ?? "",
    slug: form.get("slug") ?? "",
    team: form.get("team") ?? "",
    style: form.get("style") ?? "",
    colour: form.get("colour") ?? "",
    description: form.get("description") ?? "",
    price: form.get("price") ?? "",
    cost: form.has("cost") ? String(form.get("cost")) : undefined,
    status: form.get("status") ?? "draft",
    featured: form.get("featured") === "on",
    sizes: form.get("sizes") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;
  const price = parseMoneyToCents(v.price);
  if (price === null) return fail("Enter the price as a number, for example 45 or 45.00.");
  const slug = slugify(v.slug || v.name);
  if (!slug) return fail("The name needs at least one letter or number.");

  const canCost = roleCan(staff.role, "finance");
  let cost: number | null | undefined;
  if (canCost && v.cost !== undefined) {
    if (v.cost.trim() === "") cost = null;
    else {
      cost = parseMoneyToCents(v.cost);
      if (cost === null) return fail("Enter the cost as a number, or leave it empty if you do not know it.");
    }
  }
  const sizes = [...new Set(v.sizes.split(",").map((s) => s.trim()).filter(Boolean))];
  if (sizes.some((s) => s.length > 20)) return fail("Each size can be at most 20 characters.");

  const sb = await supabaseServer();
  const row = {
    name: v.name,
    slug,
    team: v.team,
    style: v.style,
    colour: v.colour,
    description: v.description,
    price_cents: price,
    status: v.status,
    featured: v.featured,
  };

  let id = v.id;
  if (id) {
    const { error } = await sb.from("products").update(row).eq("id", id);
    if (error) return fail(error.code === "23505" ? "Another product already uses that web address (slug)." : dbError(error.message));
  } else {
    const { data, error } = await sb.from("products").insert(row).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? "Another product already uses that web address (slug)." : dbError(error?.message));
    id = data.id as string;
  }

  if (sizes.length) {
    const { data: existing } = await sb.from("product_variants").select("size, sort").eq("product_id", id);
    const have = new Set((existing ?? []).map((e) => e.size));
    const start = (existing ?? []).reduce((m, e) => Math.max(m, e.sort + 1), 0);
    const add = sizes.filter((s) => !have.has(s)).map((size, i) => ({ product_id: id, size, sort: start + i }));
    if (add.length) {
      const { error } = await sb.from("product_variants").insert(add);
      if (error) return fail(dbError(error.message));
    }
  }

  if (cost !== undefined) {
    const { error } =
      cost === null
        ? await sb.from("product_costs").delete().eq("product_id", id)
        : await sb.from("product_costs").upsert({ product_id: id, cost_cents: cost, updated_at: new Date().toISOString() });
    if (error) return fail(dbError(error.message));
  }

  await audit(v.id ? "product.update" : "product.create", "product", id, { price_cents: price, status: v.status });
  revalidateStore(slug);
  if (!v.id) redirect(`/admin/products/${id}?created=1`);
  return ok("Saved.");
}

export async function deleteVariant(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("products"))) return DENIED;
  const id = uuid.safeParse(form.get("variantId"));
  if (!id.success) return fail("Unknown size.");
  const sb = await supabaseServer();
  const { data } = await sb.from("product_variants").select("stock, product_id").eq("id", id.data).single();
  if (!data) return fail("Unknown size.");
  if (data.stock > 0) return fail("Set stock to 0 before removing a size.");
  const { error } = await sb.from("product_variants").delete().eq("id", id.data);
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/products/${data.product_id}`);
  revalidateStore();
  return ok("Size removed.");
}

function revalidateStore(slug?: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  if (slug) revalidatePath(`/shop/${slug}`);
  revalidatePath("/admin/products");
}

// ---------------------------------------------------------------- photos

const MAX_PHOTOS = 8;

/**
 * Step 1 of a photo upload: the browser has resized the photo to WebP at 600px
 * and 1600px. The server checks access and returns one signed upload URL per
 * file. The browser then uploads straight to storage, so photos never pass
 * through our server and the service role key never leaves it.
 */
export async function requestUploadUrls(productId: string, count: number) {
  if (!(await guard("products"))) return { error: DENIED.error };
  if (!uuid.safeParse(productId).success || !Number.isInteger(count) || count < 1 || count > MAX_PHOTOS) {
    return { error: "Invalid upload request." };
  }
  const admin = supabaseAdmin();
  const uploads: { base: string; files: { size: 600 | 1600; path: string; token: string }[] }[] = [];
  for (let i = 0; i < count; i++) {
    const base = `products/${productId}/${randomUUID()}`;
    const files: { size: 600 | 1600; path: string; token: string }[] = [];
    for (const size of [600, 1600] as const) {
      const path = `${base}-${size}.webp`;
      const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return { error: "Could not prepare the upload. Try again." };
      files.push({ size, path, token: data.token });
    }
    uploads.push({ base, files });
  }
  return { uploads };
}

/** Step 2: attach uploaded photos to the product. */
export async function attachPhotos(productId: string, bases: string[]): Promise<ActionResult> {
  if (!(await guard("products"))) return DENIED;
  if (!uuid.safeParse(productId).success) return fail("Unknown product.");
  const pattern = new RegExp(`^products/${productId}/[0-9a-f-]{36}$`);
  if (!Array.isArray(bases) || !bases.every((b) => typeof b === "string" && pattern.test(b))) return fail("Invalid photo.");
  const sb = await supabaseServer();
  const { data } = await sb.from("products").select("images, slug").eq("id", productId).single();
  if (!data) return fail("Unknown product.");
  const images = [...(data.images as string[]), ...bases].slice(0, MAX_PHOTOS);
  const { error } = await sb.from("products").update({ images }).eq("id", productId);
  if (error) return fail(dbError(error.message));
  revalidateStore(data.slug);
  revalidatePath(`/admin/products/${productId}`);
  return ok("Photos added.");
}

export async function photoAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("products"))) return DENIED;
  const productId = uuid.safeParse(form.get("productId"));
  const base = String(form.get("base") ?? "");
  const op = form.get("op");
  if (!productId.success) return fail("Unknown product.");
  const sb = await supabaseServer();
  const { data } = await sb.from("products").select("images, slug").eq("id", productId.data).single();
  if (!data) return fail("Unknown product.");
  let images = data.images as string[];
  if (!images.includes(base)) return fail("Unknown photo.");
  if (op === "first") images = [base, ...images.filter((i) => i !== base)];
  else if (op === "remove") images = images.filter((i) => i !== base);
  else return fail("Unknown action.");
  const { error } = await sb.from("products").update({ images }).eq("id", productId.data);
  if (error) return fail(dbError(error.message));
  if (op === "remove") {
    try {
      await supabaseAdmin().storage.from(PHOTO_BUCKET).remove([`${base}-600.webp`, `${base}-1600.webp`]);
    } catch {
      // leaving an orphaned file is harmless; the product no longer shows it
    }
  }
  revalidateStore(data.slug);
  revalidatePath(`/admin/products/${productId.data}`);
  return ok(op === "remove" ? "Photo removed." : "Main photo changed.");
}

// ---------------------------------------------------------------- stock

export async function adjustStock(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("inventory"))) return DENIED;
  const parsed = z
    .object({
      variantId: uuid,
      change: z.coerce.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10000, "Enter a whole number other than 0."),
      reason: z.enum(["initial", "restock", "adjustment", "damaged"]),
      note: str(500),
    })
    .safeParse({ variantId: form.get("variantId"), change: form.get("change"), reason: form.get("reason"), note: form.get("note") ?? "" });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("adjust_stock", { p_variant: v.variantId, p_change: v.change, p_reason: v.reason, p_note: v.note });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products", "layout");
  revalidateStore();
  return ok(`Stock is now ${data}.`);
}

// ---------------------------------------------------------------- orders

export async function setOrderStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("orders"))) return DENIED;
  const parsed = z
    .object({ orderId: uuid, status: z.enum(["confirmed", "ready", "completed"]), note: str(500) })
    .safeParse({ orderId: form.get("orderId"), status: form.get("status"), note: form.get("note") ?? "" });
  if (!parsed.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_order_status", { p_order: parsed.data.orderId, p_status: parsed.data.status, p_note: parsed.data.note });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/orders");
  return ok("Status updated.");
}

export async function cancelOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("orders"))) return DENIED;
  const parsed = z
    .object({ orderId: uuid, restock: z.boolean(), reason: str(500) })
    .safeParse({ orderId: form.get("orderId"), restock: form.get("restock") === "on", reason: form.get("reason") ?? "" });
  if (!parsed.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cancel_order", { p_order: parsed.data.orderId, p_restock: parsed.data.restock, p_reason: parsed.data.reason });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/orders");
  revalidateStore();
  return ok(parsed.data.restock ? "Order cancelled and stock returned." : "Order cancelled.");
}

export async function setPayment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("orders"))) return DENIED;
  const parsed = z
    .object({ orderId: uuid, status: z.enum(["unpaid", "paid", "refunded"]), note: str(500) })
    .safeParse({ orderId: form.get("orderId"), status: form.get("status"), note: form.get("note") ?? "" });
  if (!parsed.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_payment_status", { p_order: parsed.data.orderId, p_status: parsed.data.status, p_note: parsed.data.note });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/orders");
  return ok("Payment updated.");
}

// ---------------------------------------------------------------- messages

export async function setMessageStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("messages"))) return DENIED;
  const id = uuid.safeParse(form.get("id"));
  const status = z.enum(["new", "handled"]).safeParse(form.get("status"));
  if (!id.success || !status.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.from("contact_messages").update({ status: status.data }).eq("id", id.data);
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/messages");
  return ok();
}

// ---------------------------------------------------------------- settings

const money = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const c = parseMoneyToCents(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: "Enter amounts as numbers, for example 5 or 5.00." });
      return z.NEVER;
    }
    return c;
  });

export async function saveSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("settings"))) return DENIED;
  const g = (k: string) => String(form.get(k) ?? "");
  const parsed = z
    .object({
      business_name: str(120),
      tagline: str(200),
      about: str(4000),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === "" || /^[A-Z]{3}$/.test(v), "Currency must be a 3-letter code such as AWG or USD.")
        .transform((v) => (v === "" ? null : v)),
      phone: str(40),
      whatsapp: str(40),
      email: z.union([z.literal("").transform(() => null), z.string().trim().email("That email address does not look right.").max(254)]),
      instagram: str(60),
      address: str(300),
      opening_hours: str(600),
      pickup_enabled: z.boolean(),
      pickup_instructions: str(1000),
      delivery_enabled: z.boolean(),
      delivery_fee_cents: money,
      free_delivery_threshold_cents: money,
      delivery_areas: str(1000),
      low_stock_threshold: z.coerce.number().int().min(0).max(1000),
      returns_policy: str(8000),
      privacy_policy: str(8000),
      terms: str(8000),
    })
    .safeParse({
      ...Object.fromEntries(
        ["business_name", "tagline", "about", "currency", "phone", "whatsapp", "email", "instagram", "address", "opening_hours", "pickup_instructions", "delivery_fee_cents", "free_delivery_threshold_cents", "delivery_areas", "low_stock_threshold", "returns_policy", "privacy_policy", "terms"].map((k) => [k, g(k)]),
      ),
      pickup_enabled: form.get("pickup_enabled") === "on",
      delivery_enabled: form.get("delivery_enabled") === "on",
    });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  if (parsed.data.delivery_enabled && parsed.data.delivery_fee_cents === null) {
    return fail("Set a delivery fee (it can be 0) before switching delivery on.");
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").update(parsed.data).eq("id", 1);
  if (error) return fail(dbError(error.message));
  await audit("settings.update", "settings", "1", { fields: Object.keys(parsed.data) });
  revalidatePath("/", "layout");
  return ok("Settings saved.");
}

// ---------------------------------------------------------------- team

export async function addTeamMember(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await guard("team");
  if (!owner) return DENIED;
  const parsed = z
    .object({
      full_name: z.string().trim().min(1, "Enter a name.").max(120),
      email: z.string().trim().toLowerCase().email("Enter a valid email."),
      role: z.enum(ROLES),
      password: z.string().min(12, "The temporary password must be at least 12 characters.").max(200),
    })
    .safeParse({ full_name: form.get("full_name"), email: form.get("email"), role: form.get("role"), password: form.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email: v.email, password: v.password, email_confirm: true });
  if (error || !data.user) {
    return fail(/already/i.test(error?.message ?? "") ? "A login with that email already exists." : "Could not create the login.");
  }
  const { error: staffError } = await admin
    .from("staff")
    .insert({ user_id: data.user.id, full_name: v.full_name, email: v.email, role: v.role });
  if (staffError) {
    await admin.auth.admin.deleteUser(data.user.id); // do not leave a login with no staff record
    return fail("Could not add the team member.");
  }
  await audit("team.add", "staff", data.user.id, { role: v.role });
  revalidatePath("/admin/team");
  return ok(`${v.full_name} can now sign in. Give them the temporary password in person.`);
}

export async function updateTeamMember(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await guard("team");
  if (!owner) return DENIED;
  const parsed = z
    .object({ userId: uuid, role: z.enum(ROLES), active: z.boolean() })
    .safeParse({ userId: form.get("userId"), role: form.get("role"), active: form.get("active") === "on" });
  if (!parsed.success) return fail("Invalid request.");
  if (parsed.data.userId === owner.userId && (parsed.data.role !== "owner" || !parsed.data.active)) {
    return fail("You cannot remove your own owner access.");
  }
  const { error } = await supabaseAdmin()
    .from("staff")
    .update({ role: parsed.data.role, active: parsed.data.active })
    .eq("user_id", parsed.data.userId);
  if (error) return fail("Could not update the team member.");
  await audit("team.update", "staff", parsed.data.userId, { role: parsed.data.role, active: parsed.data.active });
  revalidatePath("/admin/team");
  return ok("Saved.");
}
