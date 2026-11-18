# Roadmap

## Done (5 Nov 2026)

- Database: products, sizes, stock, customers, orders, timeline, inventory log, messages, audit log, settings. Row-level security on every table, costs in separate owner/manager-only tables.
- Checkout for pickup and delivery with stock locking (no overselling), delivery fee and free-delivery threshold, returning customers recognised by phone, order confirmation page.
- Store: home, shop with filters and sorting, product page with size picker, sold-out handling, contact form, info pages (about, delivery, returns, privacy, terms) from settings.
- Dashboard: overview with go-live checklist, orders list and detail with timeline, status steps, mark paid / refunded, cancel with optional restock, printable pack slip; products with photos (resized to WebP in the browser, signed upload), sizes, cost, stock adjustments; stock overview and movement log; customers; messages; sales and margin per product with CSV export; store settings; team (add member, change role, deactivate).
- Tests at that point: 25 engine, 27 database, 8 browser flows.

## Done (17 Nov 2026): retail store layout

- Announcement strip (from settings), new header with Palms in Paradise Aruba wordmark and palm mark, search, style menu, team mega menu, phone slide-out menu.
- Home: banner, shop by style tiles, new arrivals rail, shop by team, featured grid, pickup/delivery/questions strip.
- Shop: filter sidebar with counts (availability, style, size, team), active filter chips, sort, phone filter drawer, cards with New / Sold out badges, team label and size availability, second photo on hover.
- Product: gallery with thumbnails, size grid, fitted size guide, slide-out bag on add, sticky buy bar on phones, Details / Pickup & delivery / Returns sections, "More from this team", product data for search engines.
- Size guide page. Product pages are pre-built at deploy time.
- Tests: 30 engine, 27 database, 9 browser flows on desktop and phone.

## Done (18 Nov 2026): running the company

- Customer service line: chat on every store page, staff inbox with waiting/assigned/closed, takeover on reply, flood limits, no staff ids or costs ever exposed.
- My work home per role, business pulse for owner/manager (sales today/month, goal progress with straight-line projection, profit after expenses, team on shift).
- Notification bell: new order, sold out, low stock, chat, task assigned/done/comment, de-duplicated.
- Tasks: board, priorities, due dates, comments, history; leads assign to anyone, workers to themselves.
- Hours: clock in/out, weekly and monthly totals, owner corrections (audited), CSV for pay.
- Purchasing: suppliers with lead time and cost comparison, purchase orders draft → ordered → received, receiving increments stock with a logged movement; inventory staff receive without seeing costs.
- Expenses by category and month; private monthly sales goal.
- Customers: profile, history, sizes bought, notes, blocked status, merge duplicates, privacy removal.
- Team activity for the last 30 days.
- Tests: 34 engine, 39 database, 15 browser flows on desktop and phone.

## Next, in order

1. **Go live together** (DEPLOY.md), real test order on your phone.
2. Payments: needs your answer on which provider works for you in Aruba (see questions).
3. Turnstile bot check on checkout, contact and login. Sentry error reporting. MFA for owner/manager.
4. CSV inventory import with preview.
5. AI business advisor, and an AI first reply in the chat that hands over to staff (needs an Anthropic API key).
6. Discount codes, gift cards and a loyalty stamp card.
7. Email or WhatsApp alerts to staff phones for new orders and chats.
8. Papiamento and Dutch translations (your wording review needed).
9. Automated encrypted backups and a restore drill.
10. Lighthouse and axe audits with real photos.

## Questions for Shan

- Currency: do you price in AWG, USD, or both?
- Pickup: address or meeting point, days and hours.
- Delivery: do you deliver? Fee, any free-delivery amount, which areas.
- Contact: phone, WhatsApp, email, Instagram you want shown.
- Returns policy and privacy policy text (your words; a local advisor can check them).
- Payment: cash and bank transfer only for now, or a card provider? Which bank do you use?
- Products: list with selling price, your cost, sizes, stock count, and real photos.
