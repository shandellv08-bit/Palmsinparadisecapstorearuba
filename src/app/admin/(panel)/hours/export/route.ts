import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { arubaMonthStart, isLead, toCsv } from "@/lib/engine";

/** Every shift this month, for paying people. Owner and manager only. */
export async function GET() {
  const me = await getStaff();
  if (!me || !isLead(me.role)) return new NextResponse("Not allowed", { status: 403 });
  const sb = await supabaseServer();
  const from = arubaMonthStart(new Date());
  const [{ data }, { data: team }] = await Promise.all([
    sb.from("time_entries").select("user_id, started_at, ended_at, note").gte("started_at", from.toISOString()).order("started_at"),
    sb.from("staff").select("user_id, full_name"),
  ]);
  const names = new Map(((team ?? []) as { user_id: string; full_name: string }[]).map((t) => [t.user_id, t.full_name]));
  const aruba = (d: string | null) => (d ? new Date(Date.parse(d) - 4 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : null);
  const rows = ((data ?? []) as { user_id: string; started_at: string; ended_at: string | null; note: string | null }[]).map((e) => [
    names.get(e.user_id) ?? e.user_id,
    aruba(e.started_at),
    aruba(e.ended_at),
    e.ended_at ? ((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 3600_000).toFixed(2) : null,
    e.note,
  ]);
  const csv = toCsv([["person", "start_aruba", "end_aruba", "hours", "note"], ...rows]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hours-${from.toISOString().slice(0, 7)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
