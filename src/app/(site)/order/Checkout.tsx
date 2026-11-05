"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useCart } from "@/components/cart";
import { ProductImage } from "@/components/ProductImage";
import { computeTotals, formatMoney, orNotSet, type Fulfilment } from "@/lib/engine";
import { placeOrder, type CheckoutState } from "../actions";
import { keepFormSubmit } from "@/components/useKeepForm";

interface Props {
  currency: string | null;
  pickup: { instructions: string | null; address: string | null } | null;
  delivery: { feeCents: number; freeFromCents: number | null; areas: string | null } | null;
}

export function Checkout({ currency, pickup, delivery }: Props) {
  const cart = useCart();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const [fulfilment, setFulfilment] = useState<Fulfilment>(pickup ? "pickup" : "delivery");
  const unavailable = new Set(state.unavailable ?? []);
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.error) document.getElementById("checkout-error")?.focus();
  }, [state]);

  if (!cart.ready) return <p className="muted">Loading your order…</p>;
  if (cart.items.length === 0) {
    return (
      <div className="empty">
        <p>Your order is empty.</p>
        <Link href="/shop" className="btn">
          Shop caps
        </Link>
      </div>
    );
  }
  if (!pickup && !delivery) {
    return <p className="notice">Ordering is not open yet: neither pickup nor delivery is set up.</p>;
  }

  const totals = computeTotals(
    cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPriceCents: i.priceCents })),
    fulfilment,
    { deliveryEnabled: !!delivery, deliveryFeeCents: delivery?.feeCents ?? null, freeDeliveryThresholdCents: delivery?.freeFromCents ?? null },
  );
  const blocked = cart.items.some((i) => unavailable.has(i.variantId));

  return (
    <div className="two-col wide-left">
      <section aria-labelledby="items-h">
        <h2 id="items-h" className="sr-only">
          Items
        </h2>
        <ul className="line-items">
          {cart.items.map((i) => (
            <li key={i.variantId} data-testid="line">
              <ProductImage images={i.image ? [i.image] : []} alt="" sizes="64px" />
              <div>
                <Link href={`/shop/${i.slug}`}>
                  <strong>{i.name}</strong>
                </Link>
                <div className="small muted">Size {i.size}</div>
                {unavailable.has(i.variantId) ? (
                  <p className="error small" style={{ margin: ".25rem 0" }}>
                    No longer available in this size.
                  </p>
                ) : null}
                <div className="row" style={{ marginTop: ".4rem" }}>
                  <div className="qty">
                    <button type="button" aria-label={`One less ${i.name}`} onClick={() => cart.setQuantity(i.variantId, i.quantity - 1)}>
                      −
                    </button>
                    <output aria-label="Quantity">{i.quantity}</output>
                    <button type="button" aria-label={`One more ${i.name}`} onClick={() => cart.setQuantity(i.variantId, i.quantity + 1)}>
                      +
                    </button>
                  </div>
                  <button type="button" className="linkbtn small" onClick={() => cart.remove(i.variantId)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="num">{formatMoney(i.priceCents * i.quantity, currency)}</div>
            </li>
          ))}
        </ul>
        <div className="totals">
          <span>Subtotal</span>
          <span className="num">{formatMoney(totals.subtotalCents, currency)}</span>
          {fulfilment === "delivery" ? (
            <>
              <span>Delivery</span>
              <span className="num">{totals.deliveryFeeCents === 0 ? "Free" : formatMoney(totals.deliveryFeeCents, currency)}</span>
            </>
          ) : null}
          <span className="grand">Total</span>
          <span className="grand num">{formatMoney(totals.totalCents, currency)}</span>
        </div>
        <p className="small muted">The store confirms the final total when the order is placed.</p>
      </section>

      <section aria-labelledby="details-h" className="panel">
        <h2 id="details-h">Your details</h2>
        {state.error ? (
          <div id="checkout-error" className="alert" role="alert" tabIndex={-1}>
            {state.error}
          </div>
        ) : null}
        <form onSubmit={keepFormSubmit(action)} noValidate>
          <input type="hidden" name="items" value={JSON.stringify(cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })))} />
          <Field id="name" label="Name" error={fe.name}>
            <input id="name" name="name" type="text" autoComplete="name" required maxLength={120} aria-invalid={!!fe.name} aria-describedby={fe.name ? "name-err" : undefined} />
          </Field>
          <Field id="phone" label="Phone or WhatsApp" error={fe.phone}>
            <input id="phone" name="phone" type="tel" autoComplete="tel" required maxLength={40} aria-invalid={!!fe.phone} aria-describedby={fe.phone ? "phone-err" : undefined} />
          </Field>
          <Field id="email" label="Email (optional, for a receipt)" error={fe.email}>
            <input id="email" name="email" type="email" autoComplete="email" maxLength={254} aria-invalid={!!fe.email} aria-describedby={fe.email ? "email-err" : undefined} />
          </Field>
          <fieldset>
            <legend>Pickup or delivery</legend>
            {pickup ? (
              <label className="choice">
                <input type="radio" name="fulfilment" value="pickup" checked={fulfilment === "pickup"} onChange={() => setFulfilment("pickup")} />
                <span>
                  Pickup
                  <span className="small muted" style={{ display: "block" }}>
                    {pickup.instructions ?? `Address: ${orNotSet(pickup.address)}`}
                  </span>
                </span>
              </label>
            ) : null}
            {delivery ? (
              <label className="choice">
                <input type="radio" name="fulfilment" value="delivery" checked={fulfilment === "delivery"} onChange={() => setFulfilment("delivery")} />
                <span>
                  Delivery, {formatMoney(delivery.feeCents, currency)}
                  {delivery.freeFromCents !== null ? `, free from ${formatMoney(delivery.freeFromCents, currency)}` : ""}
                  <span className="small muted" style={{ display: "block" }}>
                    Areas: {orNotSet(delivery.areas)}
                  </span>
                </span>
              </label>
            ) : null}
          </fieldset>
          {fulfilment === "delivery" ? (
            <Field id="address" label="Delivery address" error={fe.address}>
              <textarea id="address" name="address" autoComplete="street-address" required maxLength={300} aria-invalid={!!fe.address} aria-describedby={fe.address ? "address-err" : undefined} />
            </Field>
          ) : (
            <input type="hidden" name="address" value="" />
          )}
          <Field id="note" label="Note (optional)">
            <textarea id="note" name="note" maxLength={1000} />
          </Field>
          <p className="small muted">Payment is arranged with the store when we confirm your order. Nothing is charged online.</p>
          <button type="submit" className="btn papaya block" disabled={pending || blocked}>
            {pending ? "Placing order…" : "Place order"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="error small" style={{ margin: ".25rem 0 0" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
