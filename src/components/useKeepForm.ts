"use client";

import { startTransition, type FormEvent } from "react";

/**
 * React 19 clears a form after a server action runs. That would wipe what a
 * person typed whenever there is a validation error, so our forms submit
 * through this handler instead, which keeps the fields as they are.
 */
export function keepFormSubmit(run: (data: FormData) => void, confirmText?: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => run(data));
  };
}
