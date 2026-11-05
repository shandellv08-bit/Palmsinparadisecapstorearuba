import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/** Anonymous client for storefront reads and the public RPCs. No cookies, no session. */
export function supabasePublic() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
