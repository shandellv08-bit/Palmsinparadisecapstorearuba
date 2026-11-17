"use client";

import { useRef } from "react";

/** Sort dropdown that applies on change. Plain GET form, so it also works with a submit button. */
export function SortSelect({ value, hidden }: { value: string; hidden: Record<string, string | undefined> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action="/shop" className="sortform">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor="sort">Sort</label>
      <select id="sort" name="sort" defaultValue={value} onChange={() => form.current?.requestSubmit()}>
        <option value="featured">Featured</option>
        <option value="newest">Newest</option>
        <option value="price-asc">Price, low to high</option>
        <option value="price-desc">Price, high to low</option>
      </select>
      <noscript>
        <button className="btn small">Sort</button>
      </noscript>
    </form>
  );
}
