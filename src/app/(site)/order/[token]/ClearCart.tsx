"use client";
import { useEffect } from "react";
import { useCart } from "@/components/cart";

export function ClearCart() {
  const { clear, ready, count } = useCart();
  useEffect(() => {
    if (ready && count > 0) clear();
  }, [ready, count, clear]);
  return null;
}
