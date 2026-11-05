"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MAX_LINES, MAX_QTY_PER_ITEM } from "@/lib/engine";

/** The order basket lives in the browser. Prices here are for display; the database sets the real total. */
export interface CartItem {
  variantId: string;
  slug: string;
  name: string;
  size: string;
  priceCents: number;
  image: string | null;
  quantity: number;
}

interface CartApi {
  items: CartItem[];
  ready: boolean;
  count: number;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const KEY = "pip-cart-v1";
const CartContext = createContext<CartApi | null>(null);

function load(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is CartItem =>
          i && typeof i.variantId === "string" && typeof i.name === "string" && Number.isInteger(i.quantity),
      )
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(load());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setItems(load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((next: CartItem[]) => {
    setItems(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode): the basket still works for this visit
    }
  }, []);

  const api = useMemo<CartApi>(
    () => ({
      items,
      ready,
      count: items.reduce((n, i) => n + i.quantity, 0),
      add: (item, quantity = 1) => {
        const existing = items.find((i) => i.variantId === item.variantId);
        if (existing) {
          save(items.map((i) => (i.variantId === item.variantId ? { ...i, quantity: Math.min(MAX_QTY_PER_ITEM, i.quantity + quantity) } : i)));
        } else if (items.length < MAX_LINES) {
          save([...items, { ...item, quantity: Math.min(MAX_QTY_PER_ITEM, quantity) }]);
        }
      },
      setQuantity: (variantId, quantity) =>
        save(
          quantity < 1
            ? items.filter((i) => i.variantId !== variantId)
            : items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(MAX_QTY_PER_ITEM, quantity) } : i)),
        ),
      remove: (variantId) => save(items.filter((i) => i.variantId !== variantId)),
      clear: () => save([]),
    }),
    [items, ready, save],
  );

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
