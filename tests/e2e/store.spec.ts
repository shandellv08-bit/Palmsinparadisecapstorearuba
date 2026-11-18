import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, seed, setStock, sql, type Seeded } from "./seed";

let s: Seeded;
test.beforeEach(async () => {
  s = await seed();
});

async function addToOrder(page: Page, slug: string, size?: string) {
  await page.goto(`/shop/${slug}`);
  if (size) await page.getByRole("radio", { name: size, exact: true }).check();
  await page.getByRole("button", { name: "Add to bag" }).click();
  const bag = page.getByRole("dialog", { name: /^Bag/ });
  await expect(bag).toBeVisible();
  await expect(bag.getByRole("link", { name: "Checkout" })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function openFilters(page: Page) {
  const btn = page.getByRole("button", { name: /^Filter/ });
  if (await btn.isVisible()) await btn.click();
  return btn;
}

async function fillDetails(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("E2E Customer");
  await page.getByLabel("Phone or WhatsApp").fill("+297 555 0101");
}

test("browse and filter the shop", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /E2E Store/ })).toBeVisible();
  await page.goto("/shop");
  await expect(page.locator(".card")).toHaveCount(3);
  // sold out sinks to the end and is labelled
  await expect(page.locator(".card").last()).toContainText("Sold out");

  await openFilters(page);
  await page.getByRole("link", { name: /^Team Two/ }).last().click();
  await expect(page).toHaveURL(/team=Team\+Two/);
  await expect(page.getByRole("heading", { level: 1, name: "Team Two" })).toBeVisible();
  await expect(page.locator(".card")).toHaveCount(1);
  await expect(page.locator(".card")).toContainText("E2E Snapback");

  await page.goto("/shop?stock=1");
  await expect(page.locator(".card")).toHaveCount(2);
  await page.goto("/shop?size=7+3%2F8&stock=1");
  await expect(page.getByText("No caps match these filters.")).toBeVisible();
});

test("order for pickup", async ({ page }) => {
  await addToOrder(page, s.navy.slug, s.navy.size);
  await page.goto("/order");
  await expect(page.getByTestId("line")).toHaveCount(1);
  await page.getByRole("button", { name: "One more E2E Fitted Navy" }).click();
  await expect(page.locator(".totals")).toContainText("XTS 90.00");
  await fillDetails(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/order\/[0-9a-f]{36}\?placed=1/);
  await expect(page.getByRole("heading", { name: /Order PIP-\d+/ })).toBeVisible();
  await expect(page.getByText("E2E pickup instructions")).toBeVisible();
  await expect(page.locator(".totals")).toContainText("XTS 90.00");
  const [v] = await sql("select stock from public.product_variants where id = $1", [s.navy.variantId]);
  expect(v.stock).toBe(1);
  // basket is emptied after ordering
  await expect(page.getByRole("button", { name: "Bag, 0 items" })).toBeVisible();
});

test("order for delivery adds the fee and needs an address", async ({ page }) => {
  await addToOrder(page, s.snap.slug);
  await page.goto("/order");
  await fillDetails(page);
  await page.getByLabel(/^Delivery, XTS 5.00/).check();
  await expect(page.locator(".totals")).toContainText("XTS 35.00");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Enter a delivery address.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("E2E Customer"); // details are kept after an error
  await page.getByLabel("Delivery address").fill("E2E street 1");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: /Order PIP-\d+/ })).toBeVisible();
  await expect(page.locator(".totals")).toContainText("XTS 35.00");
  const [o] = await sql("select fulfilment, delivery_fee_cents, total_cents from public.orders");
  expect(o).toEqual({ fulfilment: "delivery", delivery_fee_cents: 500, total_cents: 3500 });
});

test("sold-out caps cannot be ordered, even if they sell out during checkout", async ({ page }) => {
  await page.goto(`/shop/${s.soldout.slug}`);
  await expect(page.getByText("Sold out in every size.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to bag" })).toHaveCount(0);

  await page.goto(`/shop/${s.navy.slug}`);
  await expect(page.getByRole("radio", { name: /7 3\/8/ })).toBeDisabled();

  await addToOrder(page, s.snap.slug);
  await page.goto("/order");
  await fillDetails(page);
  // someone else buys the last one
  await setStock(s.snap.variantId, 0);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.locator("#checkout-error")).toContainText(/no longer available|sold out/);
  await expect(page.getByText("No longer available in this size.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
  expect(await sql("select id from public.orders")).toHaveLength(0);
});

test("contact form", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByText("not set").first()).toBeVisible(); // phone etc. not entered for this store
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("E2E Visitor");
  await page.getByLabel("Phone or email", { exact: true }).fill("visitor@example.com");
  await page.getByLabel("Message", { exact: true }).fill("Do you have 7 1/2?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message sent.")).toBeVisible();
  expect(await sql("select name from public.contact_messages")).toEqual([{ name: "E2E Visitor" }]);
});

async function signOut(page: Page) {
  const toggle = page.getByRole("button", { name: /^Menu/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (password === PASSWORD) await expect(page.getByRole("heading", { level: 1, name: /^Hi / })).toBeVisible();
}

test("admin login and role restrictions", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await login(page, USERS.owner, "wrong-password");
  await expect(page.getByText("Email or password is not correct.")).toBeVisible();

  await login(page, USERS.support);
  await expect(page.getByRole("heading", { level: 1, name: /^Hi / })).toBeVisible();
  const toggle = page.getByRole("button", { name: /^Menu/ });
  if (await toggle.isVisible()) await toggle.click();
  const nav = page.getByRole("navigation", { name: "Dashboard" });
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sales & margin" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Expenses" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Purchasing" })).toHaveCount(0);
  for (const path of ["/admin/finance", "/admin/team", "/admin/settings", "/admin/products", "/admin/expenses", "/admin/purchasing"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/no-access/);
  }
  const csv = await page.request.get("/admin/finance/export");
  expect(csv.status()).toBe(403);

  await signOut(page);
  await expect(page).toHaveURL(/\/admin\/login/);
  await login(page, USERS.owner);
  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Sales & margin" })).toBeVisible();
  await page.goto("/admin/team");
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
});

test("owner creates a product with a photo, stock and a cost, then it is on the store", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/admin/products/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E New Cap");
  await page.getByLabel("Team").fill("Team Three");
  await page.getByLabel("Selling price").fill("52.50");
  await page.getByLabel("Your cost per cap").fill("30");
  await page.getByLabel("Sizes").fill("7 1/4, 7 1/2");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created.")).toBeVisible();

  // a real PNG made by the browser
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });
  await page.getByLabel(/Add photos/).setInputFiles({ name: "cap.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("1 photo added.")).toBeVisible();
  await expect(page.locator(".photos img")).toHaveCount(1);

  const row = page.getByRole("row", { name: /7 1\/4/ });
  await row.getByLabel("Change for size 7 1/4").fill("4");
  await row.getByRole("button", { name: "Update" }).click();
  await expect(row.getByText("Stock is now 4.")).toBeVisible();

  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  const [p] = await sql("select p.images, c.cost_cents from public.products p join public.product_costs c on c.product_id = p.id where p.slug = 'e2e-new-cap'");
  expect(p.cost_cents).toBe(3000);
  expect(p.images).toHaveLength(1);
  const photo = await page.request.get(`http://127.0.0.1:54321/storage/v1/object/public/product-photos/${p.images[0]}-1600.webp`);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toContain("image/webp");

  await page.goto("/shop/e2e-new-cap");
  await expect(page.getByRole("heading", { name: "E2E New Cap" })).toBeVisible();
  await expect(page.getByLabel("Price XTS 52.50")).toBeVisible();
  await expect(page.locator(".crown img").first()).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("3000"); // cost never reaches the store
});

test("staff can confirm, mark paid and cancel an order with restock", async ({ page }) => {
  await addToOrder(page, s.navy.slug, s.navy.size);
  await page.goto("/order");
  await fillDetails(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: /Order PIP-\d+/ })).toBeVisible();

  await login(page, USERS.support);
  await page.goto("/admin/orders");
  await page.getByRole("link", { name: /PIP-\d+/ }).first().click();
  await expect(page.getByText("E2E Customer")).toBeVisible();
  await page.getByRole("button", { name: "Mark confirmed" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Payment updated.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark refunded" })).toHaveCount(0); // support cannot refund
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.locator(".tag", { hasText: "Cancelled" })).toBeVisible();
  await expect(page.locator(".timeline")).toContainText("Cancelled and stock returned");
  const [v] = await sql("select stock from public.product_variants where id = $1", [s.navy.variantId]);
  expect(v.stock).toBe(3);
});

test("header search, team menu, phone menu and size guide", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("link", { name: /Team Two/ })).toBeVisible();
    await menu.getByLabel("Search caps").fill("snap");
    await menu.getByLabel("Search caps").press("Enter");
  } else {
    await page.getByText("Teams", { exact: true }).click();
    await expect(page.getByRole("link", { name: /^Team Two/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("#hq").fill("snap");
    await page.locator("#hq").press("Enter");
  }
  await expect(page).toHaveURL(/q=snap/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Search: snap/i);
  await expect(page.locator(".pcard")).toHaveCount(1);

  await page.goto(`/shop/${s.navy.slug}`);
  // the only size in stock is chosen for the customer
  await expect(page.getByText("Size: 7 1/4")).toBeVisible();
  await page.getByRole("button", { name: "Size guide" }).click();
  const guide = page.getByRole("dialog", { name: "Size guide" });
  await expect(guide.getByRole("rowheader", { name: "7 1/4" })).toBeVisible();
  await expect(guide.getByText("57.9")).toBeVisible();
  await guide.getByRole("button", { name: "Close" }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByRole("heading", { name: "More Team One" })).toBeVisible();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: "Bag (1)" })).toBeVisible();
});
