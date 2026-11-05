import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { areasFor, ROLE_LABELS } from "@/lib/engine";
import { AdminNav } from "@/components/admin/AdminNav";
import { signOut } from "../manage";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  return (
    <div className="admin-shell">
      <aside className="admin-nav no-print">
        <a href="#main" className="skip">
          Skip to content
        </a>
        <div className="who">
          {staff.fullName}
          <br />
          {ROLE_LABELS[staff.role]}
        </div>
        <AdminNav areas={[...areasFor(staff.role)]} />
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
