/** Cart rules. Mirrors place_order() and delivery_fee_for() in 0003_functions.sql. */

export const MAX_LINES = 20;
export const MAX_QTY_PER_ITEM = 10;

export type Fulfilment = "pickup" | "delivery";

export interface CartLine {
  variantId: string;
  quantity: number;
}

export interface PricedLine extends CartLine {
  unitPriceCents: number;
}

export interface DeliverySettings {
  deliveryEnabled: boolean;
  deliveryFeeCents: number | null;
  freeDeliveryThresholdCents: number | null;
}

/** Combines repeated variants and clamps quantities to the allowed range. */
export function mergeLines(lines: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) continue;
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  return [...merged.entries()]
    .slice(0, MAX_LINES)
    .map(([variantId, quantity]) => ({ variantId, quantity: Math.min(quantity, MAX_QTY_PER_ITEM) }));
}

export function deliveryFeeFor(subtotalCents: number, feeCents: number | null, thresholdCents: number | null): number {
  if (thresholdCents !== null && subtotalCents >= thresholdCents) return 0;
  return feeCents ?? 0;
}

export function deliveryAvailable(s: DeliverySettings): boolean {
  return s.deliveryEnabled && s.deliveryFeeCents !== null;
}

export interface Totals {
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

export function computeTotals(lines: PricedLine[], fulfilment: Fulfilment, s: DeliverySettings): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const deliveryFeeCents =
    fulfilment === "delivery" ? deliveryFeeFor(subtotalCents, s.deliveryFeeCents, s.freeDeliveryThresholdCents) : 0;
  return { subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
