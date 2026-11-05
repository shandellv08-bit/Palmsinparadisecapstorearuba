import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { ActionForm } from "@/components/admin/ActionForm";
import { signIn } from "../manage";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function Login() {
  if (await getStaff()) redirect("/admin");
  return (
    <main id="main" className="wrap section" style={{ maxWidth: 440 }}>
      <h1>Staff sign in</h1>
      {!isLive() ? <p className="notice">No database is connected. The dashboard needs Supabase; see docs/DEPLOY.md.</p> : null}
      <div className="panel">
        <ActionForm action={signIn}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn block" type="submit">
            Sign in
          </button>
        </ActionForm>
      </div>
    </main>
  );
}
