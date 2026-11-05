"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client, used only to upload photos to a signed URL the server created. */
export function supabaseBrowser(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey);
}
