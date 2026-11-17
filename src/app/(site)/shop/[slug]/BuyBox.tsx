"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart";
import { CloseIcon } from "@/components/icons";
import { formatMoney, type CatalogVariant } from "@/lib/engine";

export function BuyBox({
  product,
  variants,
  currency,
  sizeGuide,
}: {
  product: { slug: string; name: string; priceCents: number; image: string | null };
  variants: CatalogVariant[];
  currency: string | null;
  sizeGuide: React.ReactNode | null;
}) {
  const { add, openBag } = useCart();
  const available = variants.filter((v) => v.in_stock);
  const [size, setSize] = useState<string | null>(available.length === 1 ? available[0].id : null);
  const [error, setError] = useState<string | null>(null);
  const [showBar, setShowBar] = useState(false);
  const mainBtn = useRef<HTMLButtonElement>(null);
  const guide = useRef<HTMLDialogElement>(null);

  // the sticky bar appears on phones once the main button scrolls out of view
  useEffect(() => {
    const el = mainBtn.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      document.getElementById("size-picker")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    add({ variantId: v.id, slug: product.slug, name: product.name, size: v.size, priceCents: product.priceCents, image: product.image });
    setError(null);
    openBag();
  }

  const chosen = variants.find((v) => v.id === size);

  return (
    <div>
      <div className="size-head">
        <strong id="size-label">Size{chosen ? `: ${chosen.size}` : ""}</strong>
        {sizeGuide ? (
          <button type="button" className="linkbtn small" onClick={() => guide.current?.showModal()} aria-haspopup="dialog">
            Size guide
          </button>
        ) : null}
      </div>
      <fieldset id="size-picker" className="sizes" aria-labelledby="size-label" aria-describedby={error ? "size-error" : undefined}>
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
                setError(null);
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
      <button ref={mainBtn} type="button" className="btn papaya" onClick={onAdd}>
        Add to bag
      </button>

      <div className={`sticky-buy${showBar ? " show" : ""}`} aria-hidden={!showBar}>
        <div className="what">
          <strong>{product.name}</strong>
          {formatMoney(product.priceCents, currency)}
          {chosen ? ` · Size ${chosen.size}` : ""}
        </div>
        <button type="button" className="btn papaya" onClick={onAdd} tabIndex={showBar ? 0 : -1}>
          {chosen ? "Add to bag" : "Choose size"}
        </button>
      </div>

      {sizeGuide ? (
        <dialog ref={guide} className="modal" aria-labelledby="sg-title" onClick={(e) => e.target === guide.current && guide.current?.close()}>
          <div className="sheet-head">
            <h2 id="sg-title" className="display">
              Size guide
            </h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => guide.current?.close()}>
              <CloseIcon />
            </button>
          </div>
          <div className="sheet-body">{sizeGuide}</div>
        </dialog>
      ) : null}
    </div>
  );
}
