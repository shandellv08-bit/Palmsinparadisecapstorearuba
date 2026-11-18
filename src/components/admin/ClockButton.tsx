"use client";

import { useEffect, useState } from "react";
import { ActionForm } from "./ActionForm";
import { clock } from "@/app/admin/ops";
import { formatHours } from "@/lib/engine";

export function ClockButton({ since }: { since: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [since]);
  return (
    <ActionForm action={clock} className="clock">
      {since ? (
        <>
          <span className="small">On shift · {formatHours((now - Date.parse(since)) / 3600_000)}</span>
          <button className="btn small papaya" name="op" value="out">
            Clock out
          </button>
        </>
      ) : (
        <>
          <span className="small">Off shift</span>
          <button className="btn small" name="op" value="in" style={{ ["--bg" as string]: "var(--sea)" }}>
            Clock in
          </button>
        </>
      )}
    </ActionForm>
  );
}
