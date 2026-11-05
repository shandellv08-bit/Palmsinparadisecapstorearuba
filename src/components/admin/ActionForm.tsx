"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/admin/manage";
import { keepFormSubmit } from "@/components/useKeepForm";

/** Wraps a server action form and reports the result next to it. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionResult);
  return (
    <form
      className={className}
      onSubmit={keepFormSubmit(formAction, confirm)}
      key={resetOnSuccess && state.ok ? String(state.at) : undefined}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}>
        {children}
      </fieldset>
      <div aria-live="polite">
        {state.error ? <p className="error small">{state.error}</p> : null}
        {state.ok && state.message ? <p className="small" style={{ color: "var(--ok)", fontWeight: 600 }}>{state.message}</p> : null}
      </div>
    </form>
  );
}
