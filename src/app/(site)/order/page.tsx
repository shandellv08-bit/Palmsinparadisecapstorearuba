import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";
import { deliveryAvailable } from "@/lib/engine";
import { Checkout } from "./Checkout";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const s = await getSettings();
  return (
    <div className="wrap section">
      <h1>Your order</h1>
      <Checkout
        currency={s.currency}
        pickup={s.pickup_enabled ? { instructions: s.pickup_instructions, address: s.address } : null}
        delivery={
          deliveryAvailable({ deliveryEnabled: s.delivery_enabled, deliveryFeeCents: s.delivery_fee_cents, freeDeliveryThresholdCents: s.free_delivery_threshold_cents })
            ? { feeCents: s.delivery_fee_cents!, freeFromCents: s.free_delivery_threshold_cents, areas: s.delivery_areas }
            : null
        }
      />
    </div>
  );
}
