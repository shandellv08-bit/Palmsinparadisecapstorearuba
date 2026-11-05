import type { CatalogProduct } from "../engine";
import { EMPTY_SETTINGS, type Settings } from "../settings";

/**
 * DEMO DATA. Used only when no database is connected and never in production
 * (see config.ts). Every item is marked as a sample. None of these are real
 * products, prices or stock levels.
 */
export const DEMO_SETTINGS: Settings = { ...EMPTY_SETTINGS };

const v = (id: string, size: string, in_stock = true) => ({ id, size, in_stock });

export const DEMO_PRODUCTS: (CatalogProduct & { stock: Record<string, number> })[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    slug: "sample-fitted-navy",
    name: "Sample fitted cap, navy",
    team: "Sample team A",
    style: "Fitted",
    colour: "Navy",
    description: "Sample item for trying the store. Not a real product.",
    price_cents: 4000,
    featured: true,
    images: [],
    variants: [v("d1000000-0000-4000-8000-000000000001", "7 1/8"), v("d1000000-0000-4000-8000-000000000002", "7 1/4"), v("d1000000-0000-4000-8000-000000000003", "7 3/8", false)],
    in_stock: true,
    created_at: "2026-01-03T00:00:00Z",
    stock: { "d1000000-0000-4000-8000-000000000001": 2, "d1000000-0000-4000-8000-000000000002": 4, "d1000000-0000-4000-8000-000000000003": 0 },
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    slug: "sample-snapback-black",
    name: "Sample snapback, black",
    team: "Sample team B",
    style: "Snapback",
    colour: "Black",
    description: "Sample item for trying the store. Not a real product.",
    price_cents: 3500,
    featured: true,
    images: [],
    variants: [v("d1000000-0000-4000-8000-000000000004", "One size")],
    in_stock: true,
    created_at: "2026-01-02T00:00:00Z",
    stock: { "d1000000-0000-4000-8000-000000000004": 6 },
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    slug: "sample-fitted-red",
    name: "Sample fitted cap, red",
    team: "Sample team A",
    style: "Fitted",
    colour: "Red",
    description: "Sample item for trying the store. Not a real product.",
    price_cents: 4200,
    featured: false,
    images: [],
    variants: [v("d1000000-0000-4000-8000-000000000005", "7 1/4", false), v("d1000000-0000-4000-8000-000000000006", "7 1/2", false)],
    in_stock: false,
    created_at: "2026-01-01T00:00:00Z",
    stock: { "d1000000-0000-4000-8000-000000000005": 0, "d1000000-0000-4000-8000-000000000006": 0 },
  },
];
