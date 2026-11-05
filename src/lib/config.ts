import { env } from "./env";

/**
 * How the app runs:
 * - "live": a Supabase database is connected. Real data only.
 * - "demo": no database and NOT production. Sample items, clearly labelled,
 *   for trying the store on a laptop. Nothing is saved.
 * - "unconfigured": no database in production. The store shows a notice
 *   instead of ever showing demo data to real customers.
 */
export type Mode = "live" | "demo" | "unconfigured";

export function getMode(): Mode {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return "live";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "demo";
}

export const isLive = () => getMode() === "live";
export const isDemo = () => getMode() === "demo";

export const PHOTO_BUCKET = "product-photos";

export function photoUrl(base: string, size: 600 | 1600): string {
  if (/^(https?:|\/)/.test(base)) return base; // demo images and absolute URLs
  const root = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${root}/storage/v1/object/public/${PHOTO_BUCKET}/${base}-${size}.webp`;
}

export function siteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
