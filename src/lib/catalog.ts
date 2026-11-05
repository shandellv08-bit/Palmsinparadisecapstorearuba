import "server-only";
import { cache } from "react";
import { getMode } from "./config";
import { supabasePublic } from "./supabase/public";
import { DEMO_PRODUCTS, DEMO_SETTINGS } from "./demo/data";
import { EMPTY_SETTINGS, SETTINGS_COLUMNS, type Settings } from "./settings";
import type { CatalogProduct } from "./engine";

/** Storefront reads. Live mode reads only public_products and settings. */

export const getSettings = cache(async (): Promise<Settings> => {
  const mode = getMode();
  if (mode === "demo") return DEMO_SETTINGS;
  if (mode === "unconfigured") return EMPTY_SETTINGS;
  const { data, error } = await supabasePublic().from("settings").select(SETTINGS_COLUMNS).eq("id", 1).single();
  if (error || !data) throw new Error("Could not load store settings");
  return data as unknown as Settings;
});

const PRODUCT_COLUMNS =
  "id, slug, name, team, style, colour, description, price_cents, featured, images, variants, in_stock, created_at";

export const getProducts = cache(async (): Promise<CatalogProduct[]> => {
  const mode = getMode();
  if (mode === "demo") return DEMO_PRODUCTS.map(({ stock: _stock, ...p }) => p);
  if (mode === "unconfigured") return [];
  const { data, error } = await supabasePublic().from("public_products").select(PRODUCT_COLUMNS).limit(1000);
  if (error) throw new Error("Could not load products");
  return (data ?? []) as unknown as CatalogProduct[];
});

export const getProduct = cache(async (slug: string): Promise<CatalogProduct | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const mode = getMode();
  if (mode !== "live") return (await getProducts()).find((p) => p.slug === slug) ?? null;
  const { data, error } = await supabasePublic().from("public_products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error("Could not load product");
  return (data as unknown as CatalogProduct) ?? null;
});
