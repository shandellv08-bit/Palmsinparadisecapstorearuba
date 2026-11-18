/** Owner numbers: hours, goal progress, profit. Pure and tested. Times are shown in Aruba time (UTC-4, no DST). */

export const ARUBA_OFFSET_MS = -4 * 3600_000;

/** Start of the day / month in Aruba, as a UTC Date. */
export function arubaDayStart(now: Date): Date {
  const local = new Date(now.getTime() + ARUBA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ARUBA_OFFSET_MS);
}
export function arubaMonthStart(now: Date): Date {
  const local = new Date(now.getTime() + ARUBA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - ARUBA_OFFSET_MS);
}
/** Monday 00:00 Aruba time of the current week. */
export function arubaWeekStart(now: Date): Date {
  const day = arubaDayStart(now);
  const local = new Date(day.getTime() + ARUBA_OFFSET_MS);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - dow * 864e5);
}
export function daysInArubaMonth(now: Date): number {
  const local = new Date(now.getTime() + ARUBA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
}

export interface TimeEntry {
  user_id: string;
  started_at: string;
  ended_at: string | null;
}

/** Hours worked inside [from, to). Open entries count up to `now`. Rounded to 0.01 h. */
export function hoursWorked(entries: TimeEntry[], from: Date, to: Date, now: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const start = Math.max(Date.parse(e.started_at), from.getTime());
    const end = Math.min(e.ended_at ? Date.parse(e.ended_at) : now.getTime(), to.getTime());
    if (end <= start) continue;
    out.set(e.user_id, (out.get(e.user_id) ?? 0) + (end - start) / 3600_000);
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100);
  return out;
}

export function formatHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

export interface GoalProgress {
  salesCents: number;
  targetCents: number | null;
  pct: number | null; // of target, 0..∞
  expectedPct: number; // share of the month that has passed
  onTrack: boolean | null;
  projectedCents: number; // straight-line projection to month end
}

/** Month-to-date sales against a goal. Projection is a straight line; it says so where shown. */
export function goalProgress(salesCents: number, targetCents: number | null, now: Date): GoalProgress {
  const start = arubaMonthStart(now).getTime();
  const days = daysInArubaMonth(now);
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (days * 864e5)));
  const projectedCents = elapsed > 0 ? Math.round(salesCents / elapsed) : 0;
  const pct = targetCents ? Math.round((salesCents / targetCents) * 1000) / 10 : null;
  return {
    salesCents,
    targetCents,
    pct,
    expectedPct: Math.round(elapsed * 1000) / 10,
    onTrack: targetCents ? projectedCents >= targetCents : null,
    projectedCents,
  };
}

/** Profit = sales margin on caps with a known cost, minus expenses. Unknown costs are reported, not guessed. */
export function profitAfterExpenses(marginCents: number, expensesCents: number): number {
  return marginCents - expensesCents;
}

export const EXPENSE_CATEGORIES = ["stock", "shipping", "marketing", "rent", "wages", "fees", "equipment", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function sumByCategory(rows: { category: ExpenseCategory; amount_cents: number }[]): Record<ExpenseCategory, number> {
  const out = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
  for (const r of rows) out[r.category] += r.amount_cents;
  return out;
}
