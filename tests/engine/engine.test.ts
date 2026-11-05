import { describe, expect, it } from "vitest";
import {
  canCancel,
  checkoutErrorMessage,
  computeTotals,
  deliveryAvailable,
  deliveryFeeFor,
  formatMoney,
  formatOrderNumber,
  mergeLines,
  nextStatuses,
  orNotSet,
  parseMoneyToCents,
  phoneKey,
  readiness,
  roleCan,
  slugify,
  stockLevel,
  summariseStock,
  transitionAllowed,
  MAX_QTY_PER_ITEM,
} from "@/lib/engine";

describe("money", () => {
  it("formats cents with and without a currency", () => {
    expect(formatMoney(4500, "AWG")).toBe("AWG 45.00");
    expect(formatMoney(125005, null)).toBe("1,250.05");
    expect(formatMoney(-150, "USD")).toBe("USD -1.50");
    expect(formatMoney(0, undefined)).toBe("0.00");
  });

  it("parses what people type", () => {
    expect(parseMoneyToCents("45")).toBe(4500);
    expect(parseMoneyToCents("45.5")).toBe(4550);
    expect(parseMoneyToCents("45,50")).toBe(4550);
    expect(parseMoneyToCents("1,250.00")).toBe(125000);
    expect(parseMoneyToCents(" 12.30 ")).toBe(1230);
  });

  it("rejects ambiguous, negative or silly input", () => {
    for (const bad of ["", "-5", "abc", "1.234", "45.", "1,25,0", "100001"]) {
      expect(parseMoneyToCents(bad)).toBeNull();
    }
  });
});

describe("cart", () => {
  it("merges repeated variants, drops bad quantities and clamps", () => {
    expect(
      mergeLines([
        { variantId: "a", quantity: 2 },
        { variantId: "b", quantity: 0 },
        { variantId: "a", quantity: 3 },
        { variantId: "c", quantity: 1.5 },
        { variantId: "d", quantity: 50 },
      ]),
    ).toEqual([
      { variantId: "a", quantity: 5 },
      { variantId: "d", quantity: MAX_QTY_PER_ITEM },
    ]);
  });

  it("charges the delivery fee below the threshold and nothing above it", () => {
    expect(deliveryFeeFor(4000, 500, 5000)).toBe(500);
    expect(deliveryFeeFor(5000, 500, 5000)).toBe(0);
    expect(deliveryFeeFor(9000, 500, null)).toBe(500);
    expect(deliveryFeeFor(9000, null, null)).toBe(0);
  });

  it("computes totals for pickup and delivery", () => {
    const lines = [
      { variantId: "a", quantity: 2, unitPriceCents: 4500 },
      { variantId: "b", quantity: 1, unitPriceCents: 3999 },
    ];
    const s = { deliveryEnabled: true, deliveryFeeCents: 1000, freeDeliveryThresholdCents: null };
    expect(computeTotals(lines, "pickup", s)).toEqual({ subtotalCents: 12999, deliveryFeeCents: 0, totalCents: 12999 });
    expect(computeTotals(lines, "delivery", s)).toEqual({
      subtotalCents: 12999,
      deliveryFeeCents: 1000,
      totalCents: 13999,
    });
  });

  it("only offers delivery when switched on and a fee is set", () => {
    expect(deliveryAvailable({ deliveryEnabled: true, deliveryFeeCents: null, freeDeliveryThresholdCents: null })).toBe(false);
    expect(deliveryAvailable({ deliveryEnabled: false, deliveryFeeCents: 500, freeDeliveryThresholdCents: null })).toBe(false);
    expect(deliveryAvailable({ deliveryEnabled: true, deliveryFeeCents: 0, freeDeliveryThresholdCents: null })).toBe(true);
  });
});

describe("permissions", () => {
  it("customer service cannot open finance, team, products or settings", () => {
    for (const area of ["finance", "team", "products", "settings", "reports", "inventory"] as const) {
      expect(roleCan("support", area)).toBe(false);
    }
    for (const area of ["dashboard", "orders", "customers", "messages"] as const) {
      expect(roleCan("support", area)).toBe(true);
    }
  });

  it("only the owner manages the team", () => {
    expect(roleCan("owner", "team")).toBe(true);
    expect(roleCan("manager", "team")).toBe(false);
    expect(roleCan("manager", "finance")).toBe(true);
    expect(roleCan("inventory", "finance")).toBe(false);
  });

  it("no role means no access", () => {
    expect(roleCan(null, "dashboard")).toBe(false);
    expect(roleCan(undefined, "orders")).toBe(false);
  });
});

describe("orders", () => {
  it("allows only forward steps", () => {
    expect(transitionAllowed("new", "confirmed")).toBe(true);
    expect(transitionAllowed("new", "ready")).toBe(true);
    expect(transitionAllowed("ready", "completed")).toBe(true);
    expect(transitionAllowed("completed", "new")).toBe(false);
    expect(transitionAllowed("cancelled", "new")).toBe(false);
    expect(transitionAllowed("new", "completed")).toBe(false);
    expect(nextStatuses("new")).toEqual(["confirmed", "ready"]);
  });

  it("cannot cancel a completed or cancelled order", () => {
    expect(canCancel("ready")).toBe(true);
    expect(canCancel("completed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });

  it("formats order numbers and explains checkout errors", () => {
    expect(formatOrderNumber(1001)).toBe("PIP-1001");
    expect(checkoutErrorMessage("out_of_stock")).toMatch(/sold out/);
    expect(checkoutErrorMessage("something_else")).toMatch(/Nothing was charged/);
  });
});

describe("stock", () => {
  it("classifies stock levels", () => {
    expect(stockLevel(0, 2)).toBe("sold_out");
    expect(stockLevel(2, 2)).toBe("low");
    expect(stockLevel(3, 2)).toBe("in_stock");
    expect(summariseStock([{ stock: 0 }, { stock: 0 }])).toEqual({ total: 0, soldOut: true });
    expect(summariseStock([{ stock: 2 }, { stock: -1 }])).toEqual({ total: 2, soldOut: false });
  });
});

describe("text", () => {
  it("keys phone numbers by digits", () => {
    expect(phoneKey("+297 560-1234")).toBe("2975601234");
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it("makes URL-safe slugs", () => {
    expect(slugify("New York Yankees 59FIFTY – Navy")).toBe("new-york-yankees-59fifty-navy");
    expect(slugify("  Café  ")).toBe("cafe");
    expect(slugify("x".repeat(100))).toHaveLength(80);
  });

  it("shows missing facts as not set", () => {
    expect(orNotSet(null)).toBe("not set");
    expect(orNotSet("   ")).toBe("not set");
    expect(orNotSet("Oranjestad")).toBe("Oranjestad");
  });
});

describe("readiness", () => {
  const empty = {
    business_name: null,
    currency: null,
    phone: null,
    email: null,
    whatsapp: null,
    address: null,
    pickup_enabled: true,
    pickup_instructions: null,
    delivery_enabled: false,
    delivery_fee_cents: null,
    delivery_areas: null,
    returns_policy: null,
    privacy_policy: null,
  };

  it("lists everything missing on a fresh install", () => {
    const items = readiness(empty, 0);
    expect(items.every((i) => !i.done || i.key === "fulfilment")).toBe(true);
    expect(items.map((i) => i.key)).toContain("pickup");
    expect(items.map((i) => i.key)).not.toContain("delivery_fee");
  });

  it("asks for delivery details only when delivery is on", () => {
    const items = readiness({ ...empty, delivery_enabled: true }, 1);
    expect(items.find((i) => i.key === "delivery_fee")?.done).toBe(false);
    expect(items.find((i) => i.key === "products")?.done).toBe(true);
  });
});

import { facets, filterProducts, parseFilter, sortSizes, type CatalogProduct } from "@/lib/engine";

describe("catalog", () => {
  const p = (over: Partial<CatalogProduct>): CatalogProduct => ({
    id: over.slug ?? "x",
    slug: "x",
    name: "X",
    team: null,
    style: null,
    colour: null,
    description: null,
    price_cents: 1000,
    featured: false,
    images: [],
    variants: [],
    in_stock: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });
  const list = [
    p({ slug: "a", name: "Alpha", team: "Team A", style: "Fitted", price_cents: 4000, variants: [{ id: "1", size: "7 1/4", in_stock: true }, { id: "2", size: "7 1/2", in_stock: false }] }),
    p({ slug: "b", name: "Bravo", team: "Team B", style: "Snapback", price_cents: 3000, featured: true, variants: [{ id: "3", size: "One size", in_stock: true }] }),
    p({ slug: "c", name: "Charlie", team: "Team A", style: "Fitted", price_cents: 5000, in_stock: false, created_at: "2026-02-01T00:00:00Z", variants: [{ id: "4", size: "7 1/2", in_stock: false }] }),
  ];

  it("parses filters from the URL and ignores junk", () => {
    expect(parseFilter({ team: "Team A", stock: "1", sort: "price-asc" })).toEqual({
      q: undefined, team: "Team A", style: undefined, size: undefined, inStock: true, sort: "price-asc",
    });
    expect(parseFilter({ sort: "drop table" }).sort).toBe("featured");
    expect(parseFilter({ team: ["Team B", "x"] }).team).toBe("Team B");
  });

  it("filters by team, style, size and stock", () => {
    expect(filterProducts(list, { team: "Team A" }).map((x) => x.slug)).toEqual(["a", "c"]);
    expect(filterProducts(list, { size: "7 1/2" }).map((x) => x.slug)).toEqual(["a", "c"]);
    expect(filterProducts(list, { size: "7 1/2", inStock: true })).toEqual([]);
    expect(filterProducts(list, { inStock: true }).map((x) => x.slug)).toEqual(["b", "a"]);
    expect(filterProducts(list, { q: "snap" }).map((x) => x.slug)).toEqual(["b"]);
  });

  it("sorts featured first and sold out last by default", () => {
    expect(filterProducts(list, {}).map((x) => x.slug)).toEqual(["b", "a", "c"]);
    expect(filterProducts(list, { sort: "price-desc" }).map((x) => x.slug)).toEqual(["c", "a", "b"]);
    expect(filterProducts(list, { sort: "newest" })[0].slug).toBe("c");
  });

  it("orders sizes the way caps are sized", () => {
    expect(sortSizes(["7 1/2", "One size", "7", "7 1/8", "M", "S"])).toEqual(["7", "7 1/8", "7 1/2", "S", "M", "One size"]);
    expect(facets(list).teams).toEqual(["Team A", "Team B"]);
  });
});

import { productProfitability, toCsv } from "@/lib/engine";

describe("reports", () => {
  it("computes margin only where cost is known", () => {
    const { rows, totals } = productProfitability([
      { productKey: "a", productName: "A", quantity: 2, unitPriceCents: 4000, unitCostCents: 2500 },
      { productKey: "a", productName: "A", quantity: 1, unitPriceCents: 4000, unitCostCents: null },
      { productKey: "b", productName: "B", quantity: 1, unitPriceCents: 3000, unitCostCents: null },
    ]);
    const a = rows.find((r) => r.productKey === "a")!;
    expect(a).toMatchObject({ unitsSold: 3, revenueCents: 12000, costCents: 5000, marginCents: 3000, marginPct: 37.5, unitsWithoutCost: 1 });
    expect(rows.find((r) => r.productKey === "b")!.marginPct).toBeNull();
    expect(totals).toMatchObject({ unitsSold: 4, revenueCents: 15000, marginCents: 3000, unitsWithoutCost: 2 });
    expect(rows[0].productKey).toBe("a");
  });

  it("writes safe CSV", () => {
    expect(toCsv([["name", "n"], ['Cap "A", red', 2], ["=HYPERLINK()", null], ["-5", -5]])).toBe(
      'name,n\r\n"Cap ""A"", red",2\r\n\'=HYPERLINK(),\r\n\'-5,-5\r\n',
    );
  });
});
