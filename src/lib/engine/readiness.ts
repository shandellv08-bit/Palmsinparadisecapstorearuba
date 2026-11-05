/**
 * Go-live checklist: which business facts are still missing.
 * The store works without them, but Shan should fill them before launch.
 */
export interface ReadinessInput {
  business_name: string | null;
  currency: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  pickup_enabled: boolean;
  pickup_instructions: string | null;
  delivery_enabled: boolean;
  delivery_fee_cents: number | null;
  delivery_areas: string | null;
  returns_policy: string | null;
  privacy_policy: string | null;
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
}

const filled = (v: string | null) => !!v && v.trim() !== "";

export function readiness(s: ReadinessInput, activeProducts: number): ReadinessItem[] {
  const items: ReadinessItem[] = [
    { key: "business_name", label: "Business name", done: filled(s.business_name) },
    { key: "currency", label: "Currency for prices", done: filled(s.currency) },
    {
      key: "contact",
      label: "At least one way to contact you (phone, WhatsApp or email)",
      done: filled(s.phone) || filled(s.whatsapp) || filled(s.email),
    },
    { key: "fulfilment", label: "Pickup or delivery switched on", done: s.pickup_enabled || s.delivery_enabled },
    { key: "returns_policy", label: "Returns policy", done: filled(s.returns_policy) },
    { key: "privacy_policy", label: "Privacy policy", done: filled(s.privacy_policy) },
    { key: "products", label: "At least one active product", done: activeProducts > 0 },
  ];
  if (s.pickup_enabled) {
    items.push({
      key: "pickup",
      label: "Pickup address or instructions",
      done: filled(s.address) || filled(s.pickup_instructions),
    });
  }
  if (s.delivery_enabled) {
    items.push({ key: "delivery_fee", label: "Delivery fee", done: s.delivery_fee_cents !== null });
    items.push({ key: "delivery_areas", label: "Delivery areas", done: filled(s.delivery_areas) });
  }
  return items;
}
