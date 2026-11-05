import { NextResponse, type NextRequest } from "next/server";
import { staffFor } from "@/lib/auth";
import { toCsv } from "@/lib/engine";
import { loadSales } from "../report";

/** CSV export of product profitability. Owner and manager only. */
export async function GET(req: NextRequest) {
  if (!(await staffFor("finance"))) return new NextResponse("Not allowed", { status: 403 });
  const d = Number(req.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90, 365].includes(d) ? d : 30;
  const { rows, totals } = await loadSales(days);
  const money = (c: number) => (c / 100).toFixed(2);
  const csv = toCsv([
    ["product", "units_sold", "sales", "cost", "margin", "margin_pct", "units_without_cost"],
    ...[...rows, totals].map((r) => [
      r.productName, r.unitsSold, money(r.revenueCents), r.marginPct === null ? null : money(r.costCents),
      r.marginPct === null ? null : money(r.marginCents), r.marginPct, r.unitsWithoutCost,
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
