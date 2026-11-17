"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";

export function MobileFilters({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => setOpen(false), [path, params]);
  return (
    <>
      <button type="button" className="btn ghost small only-mobile" style={{ display: undefined }} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Filter{count ? ` (${count})` : ""}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="left" title="Filter">
        {children}
      </Sheet>
    </>
  );
}
