# Runbook

## Every day

- **Orders → Open**: new orders. Call or WhatsApp the customer, then *Mark confirmed* → *Mark ready* → *Mark completed*. Mark paid when you receive the money.
- **Print pack slip** on an order to tick items off while packing.
- **Overview** shows low and sold-out sizes. Open the product and add stock with reason *Restock*.

## Stock

- First time you enter a size's stock: reason **First count**.
- New delivery from supplier: **Restock** with a positive number.
- Counting error: **Correction** (+ or −). Broken cap: **Damaged** with a negative number.
- You cannot type a stock number directly; every change is a logged movement. **Stock** shows the last 30.

## Cancelling

Open the order → *Cancel order*. Leave **Put the caps back in stock** ticked unless the caps are really gone. Completed orders cannot be cancelled (refunds are on the roadmap).

## Customer asks to be forgotten (privacy)

Until there is a button for this (roadmap B5), the owner runs this in Supabase **SQL Editor**, replacing the phone number:

```sql
update public.customers
set name = 'Removed', phone = null, phone_key = null, email = null, notes = null, anonymised_at = now()
where phone_key = regexp_replace('+297 000 0000', '[^0-9]', '', 'g');
```

Orders stay (needed for your bookkeeping) but no longer identify the person.

## Something is wrong

| Symptom | What to do |
|---|---|
| Store shows "being set up" | Supabase environment variables missing in Vercel. Add them, redeploy. |
| Product change not on the store | Pages refresh within 60 seconds. If you set `REVALIDATE_SECRET`, `curl -X POST -H "x-revalidate-secret: …" https://yourdomain.com/api/revalidate` refreshes immediately. |
| Staff member cannot sign in | Team → check they are *Active*. Supabase → Authentication → Users → send password reset. |
| No order emails | Check Resend dashboard and the three email variables. Orders are not affected. |
| Site down | Vercel → Deployments → *Promote* the previous working deployment. |

## Backups

Supabase takes daily backups on paid plans. On the free plan, export regularly: Supabase → Database → Backups, or `pg_dump` with the connection string. An automated encrypted backup script is on the roadmap (D10).
