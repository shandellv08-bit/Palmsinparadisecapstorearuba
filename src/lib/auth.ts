import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isLive } from "./config";
import { supabaseServer } from "./supabase/server";
import { isRole, roleCan, type Area, type Role } from "./engine";

export interface Staff {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

/** The signed-in staff member, or null. Cached for one request. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  if (!isLive()) return null;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb
    .from("staff")
    .select("user_id, email, full_name, role, active")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data || !data.active || !isRole(data.role)) return null;
  return { userId: data.user_id, email: data.email, fullName: data.full_name, role: data.role };
});

/**
 * Every admin page and every admin action calls this first. It is the server
 * side of the role rules; Postgres enforces the same rules again underneath.
 */
export async function requireStaff(area: Area): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  if (!roleCan(staff.role, area)) redirect(`/admin/no-access?area=${area}`);
  return staff;
}

/** For server actions: same check, but returns instead of redirecting. */
export async function staffFor(area: Area): Promise<Staff | null> {
  const staff = await getStaff();
  return staff && roleCan(staff.role, area) ? staff : null;
}
