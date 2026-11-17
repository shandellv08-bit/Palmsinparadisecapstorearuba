"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/engine";
import { useCart } from "./cart";
import { ProductImage } from "./ProductImage";
import { Sheet } from "./Sheet";

export function BagDrawer({ currency }: { currency: string | null }) {
  const cart = useCart();
  const subtotal = cart.items.reduce((n, i) => n + i.priceCents * i.quantity, 0);
  return (
    <Sheet
      open={cart.bagOpen}
      onClose={cart.closeBag}
      side="right"
      title={`Bag (${cart.count})`}
      id="bag"
      footer={
        cart.items.length ? (
          <>
            <div className="bag-total">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal, currency)}</span>
            </div>
            <Link href="/order" className="btn papaya block" onClick={cart.closeBag}>
              Checkout
            </Link>
            <p className="small muted" style={{ margin: ".6rem 0 0", textAlign: "center" }}>
              Pickup or delivery is chosen at checkout.
            </p>
          </>
        ) : null
      }
    >
      {cart.items.length === 0 ? (
        <div className="bag-empty">
          <p>Your bag is empty.</p>
          <Link href="/shop" className="btn" onClick={cart.closeBag}>
            Shop caps
          </Link>
        </div>
      ) : (
        cart.items.map((i) => (
          <div className="bag-line" key={i.variantId}>
            <ProductImage images={i.image ? [i.image] : []} alt="" sizes="80px" />
            <div>
              <Link href={`/shop/${i.slug}`} className="nm" onClick={cart.closeBag}>
                {i.name}
              </Link>
              <div className="small muted">Size {i.size}</div>
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
            <strong className="small">{formatMoney(i.priceCents * i.quantity, currency)}</strong>
          </div>
        ))
      )}
    </Sheet>
  );
}
