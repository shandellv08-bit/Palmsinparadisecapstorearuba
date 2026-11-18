"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes server data on an interval while the tab is visible and nobody is typing. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (document.visibilityState === "visible" && !typing) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
