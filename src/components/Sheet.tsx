"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

/**
 * Slide-out panel built on <dialog>: focus is trapped inside, Escape closes it,
 * and focus returns to the button that opened it.
 */
export function Sheet({
  open,
  onClose,
  side,
  title,
  children,
  footer,
  id,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={`sheet ${side}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="sheet-head">
        <h2 className="display">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer ? <div className="sheet-foot">{footer}</div> : null}
    </dialog>
  );
}
