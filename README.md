# Palms in Paradise

Online store and owner dashboard for Palms in Paradise, a cap store in Aruba.
One Next.js 15 app, one Supabase (Postgres) database.

- **Store** (`/`): laid out like a retail cap store. Optional announcement strip, header with search, a style menu and a team menu (slide-out menu on phones), home banner with shop by style / new arrivals / shop by team, shop page with filter sidebar and sorting, product page with gallery, size grid, fitted size guide, slide-out bag and a sticky buy bar on phones, checkout for pickup or delivery, contact form.
- **Dashboard** (`/admin`): orders, products and photos, stock, customers, messages, sales and margin (with CSV), store settings, team.

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
| `src/app/admin/manage.ts` | Every dashboard write. Each checks the role first. |
| `src/lib/auth.ts` | `requireStaff(area)`, called by every dashboard page. |
| `src/lib/config.ts` | Live / demo / unconfigured mode. Demo never runs in production. |

Roles: **owner** (everything), **manager** (everything except team), **inventory** (products, stock, orders), **support** = customer service (orders, customers, messages). The same matrix is in `src/lib/engine/permissions.ts` and in Postgres `role_can()`, and a test checks they match.

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
