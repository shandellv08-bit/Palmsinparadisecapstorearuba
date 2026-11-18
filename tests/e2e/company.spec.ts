import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, seed, sql, type Seeded } from "./seed";

/** Running the company: chat line, tasks, notifications, hours, purchasing, expenses, customers. */

let s: Seeded;
test.beforeEach(async () => {
  s = await seed();
});

async function signOut(page: Page) {
  const toggle = page.getByRole("button", { name: /^Menu/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

async function login(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hi / })).toBeVisible();
}

test("customer chat reaches the inbox and the staff reply reaches the customer", async ({ browser, viewport, isMobile }) => {
  const customer = await (await browser.newContext({ viewport, isMobile, hasTouch: isMobile })).newPage();
  await customer.goto("/shop");
  await customer.getByRole("button", { name: /Chat with us/ }).click();
  const panel = customer.getByRole("dialog", { name: "Chat with us" });
  await panel.getByLabel("Your name").fill("E2E Chatter");
  await panel.getByLabel(/Phone or email/).fill("chatter@example.com");
  await panel.getByLabel("Your question").fill("Do you have the navy one in 7 1/4?");
  await panel.getByRole("button", { name: "Start chat" }).click();
  await expect(panel.getByText("Do you have the navy one in 7 1/4?")).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  await login(staff, USERS.support);
  const toggle = staff.getByRole("button", { name: /^Menu/ });
  if (await toggle.isVisible()) await toggle.click();
  const nav = staff.getByRole("navigation", { name: "Dashboard" });
  await expect(nav.getByRole("link", { name: /Chat inbox/ })).toContainText("1");
  await nav.getByRole("link", { name: /Chat inbox/ }).click();
  await staff.getByRole("table").getByRole("link", { name: "E2E Chatter" }).click();
  await expect(staff.getByText("Do you have the navy one in 7 1/4?")).toBeVisible();
  await staff.getByLabel("Reply").fill("Yes, one left in 7 1/4.");
  await staff.getByRole("button", { name: "Send reply" }).click();
  await expect(staff.locator(".thread li.staff")).toContainText("Yes, one left");

  await expect(panel.getByText("Yes, one left in 7 1/4.")).toBeVisible({ timeout: 15000 });
  await expect(panel.locator(".thread li.staff .when")).toContainText("E2E"); // first name only
  const [c] = await sql("select needs_human, assigned_to is not null as assigned from public.conversations");
  expect(c).toEqual({ needs_human: false, assigned: true });
});

test("owner assigns a task, the worker finishes it, the owner is notified", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/admin/tasks");
  await page.getByLabel("Task").fill("Photograph new arrivals");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("For").selectOption({ label: "E2E support" });
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added.")).toBeVisible();
  await signOut(page);

  await login(page, USERS.support);
  await expect(page.getByRole("link", { name: "Photograph new arrivals", exact: true })).toBeVisible(); // on My work
  await expect(page.getByRole("link", { name: /Notifications, 1 unread/ })).toBeVisible();
  await page.getByRole("link", { name: "Photograph new arrivals", exact: true }).click();
  await page.getByLabel("Add a comment").fill("Done in the shop, uploaded.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.locator(".timeline")).toContainText("Done in the shop");
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.locator(".tag", { hasText: "Done" })).toBeVisible();
  await signOut(page);

  await login(page, USERS.owner);
  await page.getByRole("link", { name: /Notifications, \d+ unread/ }).click();
  await expect(page.getByRole("button", { name: "Done: Photograph new arrivals" })).toBeVisible();
  await page.getByRole("button", { name: "Done: Photograph new arrivals" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks\//);
});

test("new orders notify staff, and the bell links to the order", async ({ page }) => {
  await page.goto(`/shop/${s.snap.slug}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/order");
  await page.getByLabel("Name", { exact: true }).fill("Bell Customer");
  await page.getByLabel("Phone or WhatsApp").fill("5559999");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: /Order PIP-\d+/ })).toBeVisible();

  await login(page, USERS.support);
  await page.getByRole("link", { name: /Notifications, [1-9]/ }).click();
  await page.getByRole("button", { name: /New order PIP-\d+/ }).click();
  await expect(page.getByText("Bell Customer")).toBeVisible();
  const [n] = await sql("select count(*)::int as n from public.notifications where kind = 'stock.out'");
  expect(n.n).toBeGreaterThan(0); // the snapback sold out: inventory roles are told
});

test("clock in and out; the owner sees the hours", async ({ page }) => {
  await login(page, USERS.support);
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText(/On shift/)).toBeVisible();
  await page.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText("Off shift")).toBeVisible();
  await page.goto("/admin/hours/export");
  expect(page.url()).toContain("/admin/hours/export");
  await page.goto("/admin/hours");
  await expect(page.getByRole("row", { name: /E2E support/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Download this month/ })).toHaveCount(0); // workers cannot export
  await signOut(page);
  await login(page, USERS.owner);
  await page.goto("/admin/hours");
  await expect(page.getByRole("row", { name: /E2E support/ }).first()).toBeVisible();
  const csv = await page.request.get("/admin/hours/export");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("E2E support");
});

test("purchase order: owner orders, inventory receives without seeing costs, stock goes up", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/admin/purchasing");
  await page.getByLabel("Supplier name").fill("E2E Supplier");
  await page.getByLabel(/Lead time/).fill("14");
  await page.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText("Supplier added.")).toBeVisible();
  await page.reload();
  await page.getByLabel("Supplier", { exact: true }).selectOption({ label: "E2E Supplier" });
  await page.getByRole("button", { name: "New purchase order" }).click();
  await expect(page.getByRole("heading", { name: /^PO-\d+$/ })).toBeVisible();
  await page.getByLabel("Cap and size").selectOption({ label: "E2E Fitted Navy, 7 3/8 (in stock: 0)" });
  await page.getByLabel("Quantity").fill("4");
  await page.getByLabel("Unit cost").fill("19.50");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name: "7 3/8" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Mark as ordered" }).click();
  await expect(page.getByText("Marked as ordered.")).toBeVisible();
  await signOut(page);

  await login(page, USERS.inventory);
  await page.goto("/admin/inventory");
  const row = page.getByRole("row", { name: /E2E Fitted Navy, 7 3\/8/ });
  await expect(row).toBeVisible();
  expect(await page.content()).not.toContain("19.50");
  await row.getByLabel(/How many arrived/).fill("3");
  await row.getByRole("button", { name: "Receive" }).click();
  await expect(page.getByText("Received 3. Stock updated.")).toBeVisible();
  const [v] = await sql("select stock from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'e2e-fitted-navy' and v.size = '7 3/8'");
  expect(v.stock).toBe(3);
  await page.goto("/admin/purchasing");
  await expect(page).toHaveURL(/no-access/);
  await page.goto(`/shop/${s.navy.slug}`);
  await expect(page.getByRole("radio", { name: "7 3/8", exact: true })).toBeEnabled(); // back in stock on the store
});

test("expenses, goal and profit for the owner; customer notes and merge", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/admin/expenses");
  await page.getByLabel("Category").selectOption("marketing");
  await page.getByLabel("Amount").fill("25");
  await page.getByLabel("What for").fill("Instagram ad");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("cell", { name: "Instagram ad" })).toBeVisible();
  await page.goto("/admin/finance");
  await page.getByLabel("Monthly sales goal").fill("1000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByText("Goal saved.")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/Monthly goal: \d/)).toBeVisible();
  await expect(page.getByText(/expenses XTS 25.00/)).toBeVisible();

  // two orders by the same person with two numbers
  for (const phone of ["5551212", "5553434"]) {
    await sql(`select public.place_order($1::jsonb)`, [JSON.stringify({ customer: { name: "Twin " + phone, phone }, fulfilment: "pickup", items: [{ variant_id: s.navy.variantId, quantity: 1 }] })]);
  }
  await page.goto("/admin/customers?q=5551212");
  await page.getByRole("link", { name: "Twin 5551212" }).click();
  await page.getByLabel("Private notes").fill("Prefers WhatsApp");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByLabel("Same person as").selectOption({ label: "Twin 5553434 · 5553434" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Merge into this customer" }).click();
  await expect(page.getByText("Merged. Their orders are now on this customer.")).toBeVisible();
  const [c] = await sql("select count(*)::int as n from public.customers where name like 'Twin%'");
  expect(c.n).toBe(1);
  await signOut(page);

  await login(page, USERS.support);
  await page.goto("/admin/expenses");
  await expect(page).toHaveURL(/no-access/);
  await page.goto("/admin");
  await expect(page.getByText(/Monthly goal/)).toHaveCount(0);
});
