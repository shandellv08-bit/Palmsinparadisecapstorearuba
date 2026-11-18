# Palms in Paradise

Online store and owner dashboard for Palms in Paradise, a cap store in Aruba.
One Next.js 15 app, one Supabase (Postgres) database.

- **Store** (`/`): laid out like a retail cap store. Optional announcement strip, header with search, a style menu and a team menu (slide-out menu on phones), home banner with shop by style / new arrivals / shop by team, shop page with filter sidebar and sorting, product page with gallery, size grid, fitted size guide, slide-out bag and a sticky buy bar on phones, checkout for pickup or delivery, contact form.
- **Customer service line**: a chat button on every store page. Customers chat with staff; staff answer from the dashboard inbox.
- **Dashboard** (`/admin`), different for each role:
  - *My work*: each person's tasks, chats waiting, orders to handle, deliveries to receive, alerts, clock in/out. Owner and manager also see sales today and this month, progress to the monthly goal, profit after expenses, and who is on shift.
  - *Work*: chat inbox, orders (detail, timeline, pack slip, payment, cancel with restock), tasks (board, comments, history), contact form messages, hours.
  - *Store*: products and photos, stock and deliveries, customers (history, notes, merge, privacy removal), purchasing (suppliers, purchase orders, receiving).
  - *Business*: sales and margin (CSV), expenses, monthly goal, store settings, team (roles, activity).
  - A notification bell for new orders, sold-out and low sizes, chat messages and tasks. Each alert is sent once.

Nothing about the business is made up. Anything Shan has not entered (phone, address, policies, prices…) shows as **"not set"**.

## Quick start (on a laptop)

```bash
npm install
npm run dev            # demo mode: sample items, nothing saved
```

With a real local database (needs Docker):

```bash
npm run db:local       # starts Supabase locally, prints the keys
cp .env.example .env.local   # paste the keys in
npm run dev
```

## How it fits together

| Where | What |
|---|---|
| `supabase/migrations/*.sql` | The data model, security rules and all money/stock logic. **Source of truth.** |
| `src/lib/engine/*` | Pure business rules (cart totals, delivery fee, roles, order steps, reports), tested. |
| `src/app/(site)/actions.ts` | Every public write: place order, contact form. |
| `src/app/admin/manage.ts`, `src/app/admin/ops.ts` | Every dashboard write (store / running the company). Each checks the role first. |
| `src/lib/auth.ts` | `requireStaff(area)`, called by every dashboard page. |
| `src/lib/config.ts` | Live / demo / unconfigured mode. Demo never runs in production. |

Roles: **owner** (everything), **manager** (everything except team), **inventory** (products, stock and deliveries, orders, tasks, hours; never costs), **support** = customer service (chat inbox, orders, customers, messages, tasks, hours; never costs). The same matrix is in `src/lib/engine/permissions.ts` and in Postgres `role_can()`, and a test checks they match.

## Checks (definition of done)

```bash
npm run typecheck
npm test                 # engine tests + real-Postgres database tests (needs npm run db:local)
npm audit --omit=dev --audit-level=high
npm run build
npm run e2e              # browser tests, desktop + 390px phone (needs local DB and a build)
```

`npm run e2e` wipes and reseeds the **local** database and refuses to run against anything else. It needs `REVALIDATE_SECRET` in `.env.local` (any random 24+ characters).

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md): putting it online, step by step
- [docs/SECURITY.md](docs/SECURITY.md): how data is protected
- [docs/RUNBOOK.md](docs/RUNBOOK.md): day-to-day running and what to do when something breaks
- [docs/ROADMAP.md](docs/ROADMAP.md): what is done, what is next, what we need from Shan
