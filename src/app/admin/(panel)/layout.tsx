import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { areasFor, roleCan, ROLE_LABELS } from "@/lib/engine";
import { AdminNav } from "@/components/admin/AdminNav";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ClockButton } from "@/components/admin/ClockButton";
import { signOut } from "../manage";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  const sb = await supabaseServer();
  const [notes, chats, tasks, clock] = await Promise.all([
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    roleCan(staff.role, "messages")
      ? sb.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open").eq("unread_by_staff", true)
      : Promise.resolve({ count: 0 }),
    sb.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", staff.userId).neq("status", "done"),
    sb.from("time_entries").select("started_at").eq("user_id", staff.userId).is("ended_at", null).maybeSingle(),
  ]);
  const counts = { notifications: notes.count ?? 0, inbox: chats.count ?? 0, tasks: tasks.count ?? 0 };
  return (
    <div className="admin-shell">
      <AutoRefresh seconds={60} />
      <aside className="admin-nav no-print">
        <a href="#main" className="skip">
          Skip to content
        </a>
        <div className="spread">
          <div className="who">
            {staff.fullName}
            <br />
            {ROLE_LABELS[staff.role]}
          </div>
          <a href="/admin/notifications" className="bell" aria-label={`Notifications, ${counts.notifications} unread`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {counts.notifications ? <span className="dot">{counts.notifications > 99 ? "99+" : counts.notifications}</span> : null}
          </a>
        </div>
        <ClockButton since={clock.data?.started_at ?? null} />
        <AdminNav areas={[...areasFor(staff.role)]} counts={counts} />
        <form action={signOut}>
          <button className="btn ghost small" style={{ ["--fg" as string]: "var(--salt)", boxShadow: "inset 0 0 0 2px var(--salt)" }}>
            Sign out
          </button>
        </form>
      </aside>
      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
