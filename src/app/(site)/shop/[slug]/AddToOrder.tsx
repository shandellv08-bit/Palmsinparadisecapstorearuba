"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart";
import type { CatalogVariant } from "@/lib/engine";

export function AddToOrder({
  product,
  variants,
}: {
  product: { slug: string; name: string; priceCents: number; image: string | null };
  variants: CatalogVariant[];
}) {
  const { add } = useCart();
  const available = variants.filter((v) => v.in_stock);
  const [size, setSize] = useState<string | null>(available.length === 1 ? available[0].id : null);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (available.length === 0) {
    return (
      <div className="notice" role="status">
        <strong>Sold out in every size.</strong>{" "}
        <Link href={`/contact?about=${encodeURIComponent(product.name)}`}>Ask us about a restock</Link>.
      </div>
    );
  }

  function onAdd() {
    const v = variants.find((x) => x.id === size);
    if (!v) {
      setError("Choose a size first.");
      return;
    }
    add({ variantId: v.id, slug: product.slug, name: product.name, size: v.size, priceCents: product.priceCents, image: product.image });
    setError(null);
    setAdded(v.size);
  }

  return (
    <div>
      <fieldset className="sizes" aria-describedby={error ? "size-error" : undefined}>
        <legend className="sr-only">Size</legend>
        {variants.map((v) => (
          <label key={v.id}>
            <input
              type="radio"
              name="size"
              value={v.id}
              disabled={!v.in_stock}
              checked={size === v.id}
              onChange={() => {
                setSize(v.id);
                setAdded(null);
              }}
            />
            <span>
              {v.size}
              {!v.in_stock ? <span className="sr-only"> (sold out)</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p id="size-error" className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn papaya" onClick={onAdd}>
        Add to order
      </button>
      <div aria-live="polite">
        {added ? (
          <p className="success" style={{ marginTop: "1rem" }}>
            Added size {added}. <Link href="/order">Go to your order</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
