"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { staffFor, getStaff } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { parseMoneyToCents, type Area } from "@/lib/engine";
import type { ActionResult } from "./manage";

/**
 * Dashboard writes for running the company: inbox, tasks, hours, purchasing,
 * expenses, customers, notifications. Same rules as manage.ts: role check,
 * zod validation, then the caller's own session so Postgres checks again.
 */

const ok = (message?: string): ActionResult => ({ ok: true, message, at: Date.now() });
const fail = (error: string): ActionResult => ({ error });
const DENIED = fail("You do not have access to do that.");
const uuid = z.string().uuid();
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));
const date = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.")
  .transform((v) => (v === "" ? null : v));

async function guard(area: Area) {
  if (!isLive()) return null;
  return staffFor(area);
}

const MESSAGES: Record<string, string> = {
  not_allowed: "You do not have access to do that.",
  invalid_assignee: "That person cannot be assigned.",
  already_clocked_in: "You are already clocked in.",
  not_clocked_in: "You are not clocked in.",
  invalid_quantity: "That is more than what is still expected.",
  not_receivable: "Mark the order as ordered before receiving it.",
  empty_order: "Add at least one cap before marking it ordered.",
  invalid_transition: "That status change is not allowed.",
  same_customer: "Pick a different customer to merge.",
  invalid_times: "The end time must be after the start time.",
};
const dbError = (m?: string) => MESSAGES[m ?? ""] ?? "That did not save. Try again.";
const fe = <T,>(r: z.ZodSafeParseResult<T>) => (r.success ? null : fail(r.error.issues[0]?.message ?? "Check the form."));

// ---------------------------------------------------------------- notifications

export async function markNotificationsRead(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("dashboard"))) return DENIED;
  const id = form.get("id");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("mark_notifications_read", { p_ids: id ? [Number(id)] : null });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin", "layout");
  return ok();
}

/** Opening a notification marks it read and goes to its page. */
export async function openNotification(form: FormData) {
  const id = Number(form.get("id"));
  const link = String(form.get("link") ?? "/admin");
  if (await guard("dashboard")) {
    const sb = await supabaseServer();
    await sb.rpc("mark_notifications_read", { p_ids: [id] });
  }
  redirect(link.startsWith("/admin") ? link : "/admin");
}

// ---------------------------------------------------------------- inbox

export async function chatReply(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("messages"))) return DENIED;
  const p = z
    .object({ id: uuid, body: z.string().trim().min(1, "Write a reply.").max(2000) })
    .safeParse({ id: form.get("id"), body: form.get("body") ?? "" });
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("chat_reply", { p_conv: p.data.id, p_body: p.data.body });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/inbox/${p.data.id}`);
  revalidatePath("/admin/inbox");
  return ok();
}

export async function chatUpdate(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await guard("messages");
  if (!me) return DENIED;
  const p = z
    .object({ id: uuid, op: z.enum(["close", "reopen", "assign_me", "read"]) })
    .safeParse({ id: form.get("id"), op: form.get("op") });
  if (!p.success) return fail("Invalid request.");
  const args: Record<string, unknown> = { p_conv: p.data.id, p_status: null, p_assign_to: null, p_mark_read: false };
  if (p.data.op === "close") args.p_status = "closed";
  if (p.data.op === "reopen") args.p_status = "open";
  if (p.data.op === "assign_me") args.p_assign_to = me.userId;
  if (p.data.op === "read") args.p_mark_read = true;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("chat_update", args);
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/inbox/${p.data.id}`);
  revalidatePath("/admin/inbox");
  return ok(p.data.op === "close" ? "Closed." : p.data.op === "assign_me" ? "Assigned to you." : undefined);
}

// ---------------------------------------------------------------- tasks

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  details: opt(4000),
  priority: z.enum(["low", "normal", "high"]),
  due: date,
  assignee: z.union([z.literal(""), uuid]).transform((v) => (v === "" ? null : v)),
});

function readTask(form: FormData) {
  return taskSchema.safeParse({
    title: form.get("title") ?? "",
    details: form.get("details") ?? "",
    priority: form.get("priority") ?? "normal",
    due: form.get("due") ?? "",
    assignee: form.get("assignee") ?? "",
  });
}

export async function createTask(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("tasks"))) return DENIED;
  const p = readTask(form);
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("create_task", {
    p_title: p.data.title, p_details: p.data.details, p_priority: p.data.priority, p_due: p.data.due, p_assignee: p.data.assignee,
  });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return ok("Task added.");
}

export async function updateTask(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("tasks"))) return DENIED;
  const id = uuid.safeParse(form.get("id"));
  const p = readTask(form);
  if (!id.success) return fail("Unknown task.");
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_task", {
    p_task: id.data, p_title: p.data.title, p_details: p.data.details, p_priority: p.data.priority, p_due: p.data.due, p_assignee: p.data.assignee,
  });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/tasks/${id.data}`);
  revalidatePath("/admin/tasks");
  return ok("Saved.");
}

export async function setTaskStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("tasks"))) return DENIED;
  const p = z.object({ id: uuid, status: z.enum(["todo", "doing", "done"]) }).safeParse({ id: form.get("id"), status: form.get("status") });
  if (!p.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_task_status", { p_task: p.data.id, p_status: p.data.status });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/tasks/${p.data.id}`);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  return ok();
}

export async function addTaskComment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("tasks"))) return DENIED;
  const p = z.object({ id: uuid, body: z.string().trim().min(1, "Write a comment.").max(2000) }).safeParse({ id: form.get("id"), body: form.get("body") ?? "" });
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_task_comment", { p_task: p.data.id, p_body: p.data.body });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/tasks/${p.data.id}`);
  return ok();
}

// ---------------------------------------------------------------- hours

export async function clock(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("hours"))) return DENIED;
  const op = form.get("op");
  const sb = await supabaseServer();
  const { error } =
    op === "in" ? await sb.rpc("clock_in") : await sb.rpc("clock_out", { p_note: String(form.get("note") ?? "").slice(0, 300) || null });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin", "layout");
  return ok(op === "in" ? "Clocked in." : "Clocked out.");
}

export async function fixTimeEntry(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("team"))) return DENIED;
  const p = z
    .object({
      id: z.coerce.number().int().positive(),
      start: z.string().min(16),
      end: z.string().transform((v) => (v === "" ? null : v)),
    })
    .safeParse({ id: form.get("id"), start: form.get("start"), end: form.get("end") ?? "" });
  if (!p.success) return fail("Enter a start time.");
  // datetime-local inputs are Aruba time (UTC-4, no daylight saving)
  const iso = (v: string) => new Date(`${v}:00-04:00`).toISOString();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("fix_time_entry", { p_id: p.data.id, p_start: iso(p.data.start), p_end: p.data.end ? iso(p.data.end) : null });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/hours");
  return ok("Corrected.");
}

// ---------------------------------------------------------------- purchasing

export async function saveSupplier(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("purchasing"))) return DENIED;
  const p = z
    .object({
      id: z.union([z.literal(""), uuid]),
      name: z.string().trim().min(1, "Enter the supplier name.").max(120),
      contact_name: opt(120),
      phone: opt(40),
      email: z.union([z.literal("").transform(() => null), z.string().trim().email("That email does not look right.").max(254)]),
      website: opt(200),
      lead_time_days: z
        .string()
        .trim()
        .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 365), "Lead time is a number of days (0 to 365).")
        .transform((v) => (v === "" ? null : Number(v))),
      notes: opt(4000),
    })
    .safeParse(Object.fromEntries(["id", "name", "contact_name", "phone", "email", "website", "lead_time_days", "notes"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!p.success) return fe(p)!;
  const { id, ...row } = p.data;
  const sb = await supabaseServer();
  const { error } = id ? await sb.from("suppliers").update(row).eq("id", id) : await sb.from("suppliers").insert(row);
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/purchasing");
  return ok(id ? "Saved." : "Supplier added.");
}

export async function createPurchaseOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await guard("purchasing");
  if (!me) return DENIED;
  const p = z
    .object({ supplier: z.union([z.literal(""), uuid]).transform((v) => v || null), expected: date, notes: opt(4000) })
    .safeParse({ supplier: form.get("supplier") ?? "", expected: form.get("expected") ?? "", notes: form.get("notes") ?? "" });
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("purchase_orders")
    .insert({ supplier_id: p.data.supplier, expected_on: p.data.expected, notes: p.data.notes, created_by: me.userId })
    .select("id")
    .single();
  if (error || !data) return fail(dbError(error?.message));
  redirect(`/admin/purchasing/${data.id}`);
}

export async function updatePurchaseOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("purchasing"))) return DENIED;
  const p = z
    .object({
      id: uuid,
      expected: date,
      shipping: z.string().trim(),
      notes: opt(4000),
    })
    .safeParse({ id: form.get("id"), expected: form.get("expected") ?? "", shipping: form.get("shipping") ?? "", notes: form.get("notes") ?? "" });
  if (!p.success) return fe(p)!;
  const shipping = p.data.shipping === "" ? 0 : parseMoneyToCents(p.data.shipping);
  if (shipping === null) return fail("Enter shipping as a number.");
  const sb = await supabaseServer();
  const { error } = await sb.from("purchase_orders").update({ expected_on: p.data.expected, shipping_cents: shipping, notes: p.data.notes }).eq("id", p.data.id);
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/purchasing/${p.data.id}`);
  return ok("Saved.");
}

export async function addPoLine(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("purchasing"))) return DENIED;
  const p = z
    .object({ po: uuid, variant: uuid, qty: z.coerce.number().int().min(1, "Quantity must be at least 1.").max(10000), cost: z.string().trim() })
    .safeParse({ po: form.get("po"), variant: form.get("variant"), qty: form.get("qty"), cost: form.get("cost") ?? "" });
  if (!p.success) return fe(p)!;
  const cost = p.data.cost === "" ? null : parseMoneyToCents(p.data.cost);
  if (p.data.cost !== "" && cost === null) return fail("Enter the unit cost as a number, or leave it empty.");
  const sb = await supabaseServer();
  const { error } = await sb
    .from("purchase_order_items")
    .insert({ po_id: p.data.po, variant_id: p.data.variant, quantity_ordered: p.data.qty, unit_cost_cents: cost });
  if (error) return fail(error.code === "23505" ? "That size is already on this order." : "Lines can only be added while the order is a draft.");
  revalidatePath(`/admin/purchasing/${p.data.po}`);
  return ok("Added.");
}

export async function removePoLine(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("purchasing"))) return DENIED;
  const p = z.object({ po: uuid, item: uuid }).safeParse({ po: form.get("po"), item: form.get("item") });
  if (!p.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error, count } = await sb.from("purchase_order_items").delete({ count: "exact" }).eq("id", p.data.item);
  if (error || !count) return fail("Lines can only be removed while the order is a draft.");
  revalidatePath(`/admin/purchasing/${p.data.po}`);
  return ok();
}

export async function setPoStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("purchasing"))) return DENIED;
  const p = z.object({ po: uuid, status: z.enum(["ordered", "cancelled"]) }).safeParse({ po: form.get("po"), status: form.get("status") });
  if (!p.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_po_status", { p_po: p.data.po, p_status: p.data.status });
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/purchasing/${p.data.po}`);
  revalidatePath("/admin/purchasing");
  return ok(p.data.status === "ordered" ? "Marked as ordered." : "Cancelled.");
}

export async function receivePoItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("inventory"))) return DENIED;
  const p = z
    .object({ item: uuid, qty: z.coerce.number().int().min(1, "Enter how many arrived.").max(10000) })
    .safeParse({ item: form.get("item"), qty: form.get("qty") });
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("receive_po_item", { p_item: p.data.item, p_qty: p.data.qty });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/purchasing", "layout");
  revalidatePath("/", "layout");
  return ok(`Received ${p.data.qty}. Stock updated.`);
}

// ---------------------------------------------------------------- expenses

export async function addExpense(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await guard("finance");
  if (!me) return DENIED;
  const p = z
    .object({
      spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date."),
      category: z.enum(["stock", "shipping", "marketing", "rent", "wages", "fees", "equipment", "other"]),
      amount: z.string().trim(),
      description: z.string().trim().min(1, "Describe the expense.").max(300),
    })
    .safeParse({ spent_on: form.get("spent_on"), category: form.get("category"), amount: form.get("amount") ?? "", description: form.get("description") ?? "" });
  if (!p.success) return fe(p)!;
  const amount = parseMoneyToCents(p.data.amount);
  if (!amount) return fail("Enter the amount as a number above 0.");
  const sb = await supabaseServer();
  const { error } = await sb.from("expenses").insert({
    spent_on: p.data.spent_on, category: p.data.category, amount_cents: amount, description: p.data.description, created_by: me.userId,
  });
  if (error) return fail(dbError(error.message));
  await sb.rpc("log_audit", { p_action: "expense.add", p_entity: "expense", p_entity_id: p.data.category, p_details: { amount_cents: amount } });
  revalidatePath("/admin/expenses");
  revalidatePath("/admin");
  return ok("Expense added.");
}

export async function deleteExpense(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("finance"))) return DENIED;
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.from("expenses").delete().eq("id", id.data);
  if (error) return fail(dbError(error.message));
  await sb.rpc("log_audit", { p_action: "expense.delete", p_entity: "expense", p_entity_id: id.data, p_details: {} });
  revalidatePath("/admin/expenses");
  return ok("Removed.");
}

// ---------------------------------------------------------------- customers

export async function saveCustomer(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("customers"))) return DENIED;
  const p = z
    .object({ id: uuid, notes: opt(4000), status: z.enum(["active", "blocked"]) })
    .safeParse({ id: form.get("id"), notes: form.get("notes") ?? "", status: form.get("status") ?? "active" });
  if (!p.success) return fe(p)!;
  const sb = await supabaseServer();
  const { error } = await sb.from("customers").update({ notes: p.data.notes, status: p.data.status }).eq("id", p.data.id);
  if (error) return fail(dbError(error.message));
  revalidatePath(`/admin/customers/${p.data.id}`);
  return ok("Saved.");
}

export async function anonymiseCustomer(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await getStaff();
  if (!me || !(await guard("customers"))) return DENIED;
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return fail("Invalid request.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("anonymise_customer", { p_customer: id.data });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/customers");
  redirect("/admin/customers?removed=1");
}

export async function mergeCustomers(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("customers"))) return DENIED;
  const p = z.object({ keep: uuid, remove: uuid }).safeParse({ keep: form.get("keep"), remove: form.get("remove") });
  if (!p.success) return fail("Choose the customer to merge in.");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("merge_customers", { p_keep: p.data.keep, p_remove: p.data.remove });
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin/customers", "layout");
  return ok("Merged. Their orders are now on this customer.");
}

// ---------------------------------------------------------------- goals

export async function setGoal(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await guard("finance"))) return DENIED;
  const raw = String(form.get("target") ?? "").trim();
  const cents = raw === "" ? null : parseMoneyToCents(raw);
  if (raw !== "" && cents === null) return fail("Enter the goal as a number, or leave it empty.");
  const sb = await supabaseServer();
  const { error } = await sb.from("goals").update({ monthly_sales_target_cents: cents, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return fail(dbError(error.message));
  revalidatePath("/admin", "layout");
  return ok("Goal saved.");
}
