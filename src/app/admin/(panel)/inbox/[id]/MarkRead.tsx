"use client";

import { useEffect } from "react";
import { chatUpdate } from "../../../ops";

/** Opening a waiting chat marks it as seen. */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    const f = new FormData();
    f.set("id", id);
    f.set("op", "read");
    void chatUpdate({}, f);
  }, [id]);
  return null;
}
