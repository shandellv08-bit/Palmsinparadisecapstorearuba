# Putting the store online

About an hour the first time. You need: a laptop, an email address, and a card for the domain (Supabase and Vercel both have free tiers that are enough to start).

## 1. Create the database (Supabase)

1. Go to supabase.com, sign up, **New project**. Name it `palms-in-paradise`. Pick the region closest to Aruba (US East). Save the database password in a password manager.
2. When it is ready, open **SQL Editor**. Open each file in `supabase/migrations/` **in order** (0001, 0002, 0003, 0004), paste its whole content, press **Run**. Each must say "Success". Do not skip or reorder.
   (If you have the Supabase CLI: `npx supabase@3.0.0 link` then `npx supabase@3.0.0 db push` does the same.)
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". Staff accounts are only created from the dashboard. Turn **on** "Leaked password protection" if offered.
4. **Authentication → URL Configuration**: set Site URL to your domain (for example `https://yourdomain.com`).
5. **Project Settings → API**: copy the **Project URL**, the **anon / publishable key** and the **service_role / secret key**. The service role key is a master key: never paste it anywhere public, never in a `NEXT_PUBLIC_` variable.

## 2. Create your owner login

On your laptop, in the project folder:

```bash
npm install
```

```bash
SUPABASE_URL=https://YOUR-PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-KEY node scripts/create-owner.mjs "Your Name" you@example.com
```

It asks for a password (at least 12 characters; it is not shown while you type).

## 3. Put the site online (Vercel)

1. Sign up at vercel.com. **Add New → Project** and upload this folder (or connect it from Git if you use one later).
2. Before deploying, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1.5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` |
| `REVALIDATE_SECRET` | any random 32 characters (optional) |
| `RESEND_API_KEY`, `ORDER_EMAIL_FROM`, `ORDER_NOTIFY_EMAIL` | optional, for order emails (see below) |

3. Deploy. If the two Supabase variables are missing, the live site shows "being set up" instead of demo items. That is on purpose.

## 4. Connect your domain

Vercel → Project → **Settings → Domains** → add your domain and follow the DNS instructions it shows at your domain registrar. HTTPS is automatic.

## 5. Order emails (optional)

Sign up at resend.com, verify your domain, create an API key. Set `RESEND_API_KEY`, `ORDER_EMAIL_FROM` (for example `Palms in Paradise <orders@yourdomain.com>`) and `ORDER_NOTIFY_EMAIL` (where you want new-order alerts). If email fails, orders still go through.

## 6. Go-live checklist

Sign in at `/admin`. The overview shows **Before you go live** until these are done:

- [ ] Store settings: business name, currency, at least one contact, pickup details and/or delivery fee and areas
- [ ] Returns policy and privacy policy written (by you; we do not write legal text for you)
- [ ] At least one product: name, price, cost, sizes, stock, real photos, status **Active**
- [ ] Place a real test order on your phone (pickup), check it appears in **Orders**, mark it ready, completed, paid
- [ ] Place a delivery test order if you deliver
- [ ] Cancel one test order with "put back in stock" ticked and check stock went back up
- [ ] Send a message from the contact page and check it appears in **Messages**
- [ ] If emails are set up: check the new-order email arrived
- [ ] Add a customer-service team member, sign in as them on another browser, confirm they cannot open Sales or Team
- [ ] Delete the test orders' effect: cancel them with restock (orders stay in history, which is normal)
