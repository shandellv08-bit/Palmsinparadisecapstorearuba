# Security

## Principles

1. **The database enforces the rules.** Every table has row-level security. The dashboard hides buttons people cannot use, but even if someone calls the API directly with a stolen staff login, Postgres refuses anything outside their role.
2. **Customers see only public data.** The store reads the `public_products` view (active products, sizes, in-stock yes/no, no cost, no exact stock) and `settings`. The anonymous role cannot select from any other table. Tests check this for every table.
3. **Costs live in their own tables** (`product_costs`, `order_item_costs`), readable only by owner and manager.
4. **Money and stock change only inside Postgres functions** (`place_order`, `cancel_order`, `adjust_stock`). A trigger blocks any other stock change, and every change writes an `inventory_movements` row. Prices are read from the database at checkout; whatever the browser sends is ignored.
5. **Every dashboard page calls `requireStaff(area)`**, every write in `manage.ts` checks the role, validates input with zod, and important changes go to `audit_log` (append only, readable by owner and manager).
6. **The service role key is server-only** (`import "server-only"`). It is used only to create staff logins and to sign photo-upload URLs, always after the role check.
7. **Photos** upload straight from the browser to Supabase Storage through short-lived signed URLs. Only JPEG/PNG/WebP up to 5 MB are accepted by the bucket; they are resized to WebP in the browser first.

## Abuse limits

- Max 5 open orders per phone number per hour; max 10 of one size and 20 lines per order.
- Contact form: honeypot field plus a global limit of 30 messages per 10 minutes.
- Not yet: Cloudflare Turnstile (bot check) on checkout, contact and login. See ROADMAP.

## Headers

`X-Frame-Options: DENY`, `nosniff`, HSTS, strict referrer, no camera/mic/location. Dashboard responses are `no-store` and `noindex`.

## Accessibility

Colour pairs used for text (checked against WCAG AA 4.5:1): sea-deep on salt 13.7:1, sea on salt 8.9:1, papaya-ink on salt 5.6:1, white on sea 8.9:1, white on papaya-ink 6.1:1, muted on salt 6.9:1. Papaya (light orange) is used only as a fill with dark text. All forms have labels, errors are announced, everything works by keyboard, focus is always visible. A full automated axe audit has not been run yet.

## Reporting a problem

If you think data leaked: sign in to Supabase, rotate the service role key (Project Settings → API), update it in Vercel, redeploy. Then see RUNBOOK.
