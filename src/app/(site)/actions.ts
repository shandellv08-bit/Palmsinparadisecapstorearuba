"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getMode } from "@/lib/config";
import { supabasePublic } from "@/lib/supabase/public";
import { getProducts, getSettings } from "@/lib/catalog";
import { checkoutErrorMessage, computeTotals, deliveryAvailable, formatMoney, formatOrderNumber, mergeLines } from "@/lib/engine";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { DEMO_PRODUCTS } from "@/lib/demo/data";
import { demoReceipts } from "@/lib/demo/receipts";

/** All public writes. Everything is validated here and again in Postgres. */

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const checkoutSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(120),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine((p) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15, "Enter a phone number with at least 7 digits."),
    email: z.union([z.literal(""), z.string().trim().email("That email address does not look right.").max(254)]),
    fulfilment: z.enum(["pickup", "delivery"], { message: "Choose pickup or delivery." }),
    address: z.string().trim().max(300),
    note: z.string().trim().max(1000),
    items: z
      .array(z.object({ variantId: uuid, quantity: z.number().int().min(1).max(10) }))
      .min(1, "Your order is empty.")
      .max(20),
  })
  .refine((v) => v.fulfilment === "pickup" || v.address.length > 0, { message: "Enter a delivery address.", path: ["address"] });

export interface CheckoutState {
  error?: string;
  fieldErrors?: Record<string, string>;
  unavailable?: string[]; // variant ids that sold out or disappeared
}

export async function placeOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  let items: unknown;
  try {
    items = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    return { error: "Your order could not be read. Refresh the page and try again." };
  }
  const parsed = checkoutSchema.safeParse({
    name: form.get("name") ?? "",
    phone: form.get("phone") ?? "",
    email: form.get("email") ?? "",
    fulfilment: form.get("fulfilment") ?? "",
    address: form.get("address") ?? "",
    note: form.get("note") ?? "",
    items,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const lines = mergeLines(v.items);

  // Check availability first so the customer sees exactly which cap sold out.
  const products = await getProducts();
  const variants = new Map(products.flatMap((p) => p.variants.map((x) => [x.id, { ...x, product: p }] as const)));
  const unavailable = lines.filter((l) => !variants.get(l.variantId)?.in_stock).map((l) => l.variantId);
  if (unavailable.length) {
    return { error: "Some caps in your order are no longer available. Remove them to continue.", unavailable };
  }

  const settings = await getSettings();
  const mode = getMode();
  if (mode === "unconfigured") return { error: "Orders are not open yet." };
  if (v.fulfilment === "delivery" && !deliveryAvailable({ deliveryEnabled: settings.delivery_enabled, deliveryFeeCents: settings.delivery_fee_cents, freeDeliveryThresholdCents: settings.free_delivery_threshold_cents })) {
    return { error: checkoutErrorMessage("delivery_unavailable") };
  }
  if (v.fulfilment === "pickup" && !settings.pickup_enabled) return { error: checkoutErrorMessage("pickup_unavailable") };

  if (mode === "demo") {
    // Nothing is saved in demo mode. We only check stock against the sample data.
    for (const l of lines) {
      const stock = DEMO_PRODUCTS.flatMap((p) => Object.entries(p.stock)).find(([id]) => id === l.variantId)?.[1] ?? 0;
      if (stock < l.quantity) return { error: checkoutErrorMessage("out_of_stock"), unavailable: [l.variantId] };
    }
    const priced = lines.map((l) => ({ ...l, unitPriceCents: variants.get(l.variantId)!.product.price_cents }));
    const totals = computeTotals(priced, v.fulfilment, { deliveryEnabled: settings.delivery_enabled, deliveryFeeCents: settings.delivery_fee_cents, freeDeliveryThresholdCents: settings.free_delivery_threshold_cents });
    const token = randomBytes(18).toString("hex");
    demoReceipts.set(token, {
      number: "DEMO",
      status: "new",
      payment_status: "unpaid",
      fulfilment: v.fulfilment,
      currency: settings.currency,
      subtotal_cents: totals.subtotalCents,
      delivery_fee_cents: totals.deliveryFeeCents,
      total_cents: totals.totalCents,
      created_at: new Date().toISOString(),
      items: priced.map((l) => ({ name: variants.get(l.variantId)!.product.name, size: variants.get(l.variantId)!.size, quantity: l.quantity, unit_price_cents: l.unitPriceCents })),
    });
    redirect(`/order/${token}?placed=1`);
  }

  const { data, error } = await supabasePublic().rpc("place_order", {
    payload: {
      customer: { name: v.name, phone: v.phone, email: v.email || null },
      fulfilment: v.fulfilment,
      delivery_address: v.fulfilment === "delivery" ? v.address : null,
      note: v.note || null,
      items: lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
    },
  });
  if (error || !data) {
    const code = error?.message;
    const detail = error?.details;
    return {
      error: checkoutErrorMessage(code),
      unavailable: (code === "out_of_stock" || code === "unavailable") && detail ? [detail] : undefined,
    };
  }
  const placed = data as { number: number; token: string; total_cents: number; currency: string | null };

  // Stock changed: refresh the cached pages of the caps that were ordered.
  for (const slug of new Set(lines.map((l) => variants.get(l.variantId)?.product.slug))) {
    if (slug) revalidatePath(`/shop/${slug}`);
  }
  revalidatePath("/shop");
  revalidatePath("/");

  // Emails are best effort. A failure here never undoes or fails the order.
  const label = formatOrderNumber(placed.number);
  const total = formatMoney(placed.total_cents, placed.currency);
  const summary = lines
    .map((l) => `${l.quantity} x ${variants.get(l.variantId)?.product.name} (${variants.get(l.variantId)?.size})`)
    .join("\n");
  await Promise.allSettled([
    env.ORDER_NOTIFY_EMAIL
      ? sendEmail({
          to: env.ORDER_NOTIFY_EMAIL,
          subject: `New order ${label}`,
          text: `${label}\n${v.fulfilment}\nTotal ${total}\n\n${summary}\n\nOpen the dashboard to see the customer details.`,
        })
      : Promise.resolve(false),
    v.email
      ? sendEmail({
          to: v.email,
          subject: `We received your order ${label}`,
          text: `Thank you. We received order ${label}.\n\n${summary}\n\nTotal ${total}\n\nWe will contact you to confirm ${v.fulfilment}.`,
        })
      : Promise.resolve(false),
  ]);

  redirect(`/order/${placed.token}?placed=1`);
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  contact: z.string().trim().min(3, "Enter a phone number or email so we can reply.").max(254),
  message: z.string().trim().min(1, "Write a message.").max(4000),
  website: z.string().max(0), // honeypot: real people leave this empty
});

export interface ContactState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function sendContact(_prev: ContactState, form: FormData): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    name: form.get("name") ?? "",
    contact: form.get("contact") ?? "",
    message: form.get("message") ?? "",
    website: form.get("website") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    if (fieldErrors.website) return { ok: true }; // silently drop bots
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const mode = getMode();
  if (mode === "demo") return { ok: true };
  if (mode === "unconfigured") return { error: "Messages are not open yet." };
  const { error } = await supabasePublic().rpc("submit_contact", {
    p_name: parsed.data.name,
    p_contact: parsed.data.contact,
    p_message: parsed.data.message,
  });
  if (error) return { error: "Your message could not be sent. Try again in a moment." };
  if (env.ORDER_NOTIFY_EMAIL) {
    await sendEmail({ to: env.ORDER_NOTIFY_EMAIL, subject: "New message from the website", text: "Open the dashboard to read it." });
  }
  return { ok: true };
}
