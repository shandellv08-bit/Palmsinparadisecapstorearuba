# Runbook

## Every day

- **Clock in** when you start (top of the dashboard menu) and **clock out** when you leave.
- **My work** shows what needs you: tasks, chats waiting, orders, deliveries, alerts.
- **Chat inbox**: answer waiting chats (marked *waiting*). Replying assigns the chat to you. Close it when done; if the customer writes again it reopens. Never ask for card numbers in chat.

- **Orders → Open**: new orders. Call or WhatsApp the customer, then *Mark confirmed* → *Mark ready* → *Mark completed*. Mark paid when you receive the money.
- **Print pack slip** on an order to tick items off while packing.
- **Overview** shows low and sold-out sizes. Open the product and add stock with reason *Restock*.

## How the store fills itself in

- **Menus and tiles** (styles, teams, "Shop by team") are built from your products. Fill in **Team** and **Style** on every product and use the same spelling each time, for example always "Fitted", never "fitted" or "59fifty fitted" on one and "Fitted" on another.
- **New** badges show for 30 days after a product is created.
- **Featured** products come first and the first featured one with a photo is the big cap on the home banner.
- **Size guide** appears on caps with fitted sizes (6 7/8 to 8). The measurements are calculated from the size.
- **Announcement strip**: Store settings, top field. Leave empty to hide it. Only write things that are true.

## Running the team

- **Tasks**: the owner or manager assigns; workers can add tasks for themselves. The person who gave the task is told when it is done.
- **Hours**: everyone sees their own; owner and manager see everyone and download the month as CSV for pay. Only the owner can correct a shift (logged).
- **Team → Last 30 days**: hours, tasks done, order updates and chat replies per person.

## Buying stock

1. **Purchasing → New purchase order**, pick the supplier, add caps and sizes with unit cost. Add shipping and duties.
2. **Mark as ordered** when you have paid or confirmed. The lines lock.
3. When the box arrives, whoever handles stock opens **Stock & deliveries**, counts, and presses **Receive**. Stock goes up and the movement is logged as PO-number. Inventory staff never see what you paid.
4. The supplier list compares lead time and average cost per cap.

## Money

- **Expenses**: add every cost that is not a purchase order (rent, ads, fees, wages, shipping). Profit on My work = margin on caps sold − expenses.
- **Monthly goal**: set on Sales & margin. Private to owner and manager.

## Stock

- First time you enter a size's stock: reason **First count**.
- New delivery from supplier: **Restock** with a positive number.
- Counting error: **Correction** (+ or −). Broken cap: **Damaged** with a negative number.
- You cannot type a stock number directly; every change is a logged movement. **Stock** shows the last 30.

## Cancelling

Open the order → *Cancel order*. Leave **Put the caps back in stock** ticked unless the caps are really gone. Completed orders cannot be cancelled (refunds are on the roadmap).

## Customer asks to be forgotten (privacy)

Customers → open the person → **Forget this customer** (owner or manager). Removes name, phone, email, notes and delivery addresses. Orders and totals stay for bookkeeping. Logged in the audit log.

## Same customer twice

Customers → open one record → **Same person as** → pick the other → **Merge**. Orders move over, the other record is removed.

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
