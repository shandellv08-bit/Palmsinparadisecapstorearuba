"use client";

import { useActionState } from "react";
import { sendContact, type ContactState } from "../actions";
import { keepFormSubmit } from "@/components/useKeepForm";

export function ContactForm({ about }: { about?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, {});
  const fe = state.fieldErrors ?? {};
  if (state.ok) {
    return (
      <p className="success" role="status">
        Message sent. We will reply as soon as we can.
      </p>
    );
  }
  return (
    <form onSubmit={keepFormSubmit(action)} noValidate>
      {state.error ? (
        <p className="alert" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="c-name">Name</label>
        <input id="c-name" name="name" type="text" autoComplete="name" required maxLength={120} aria-invalid={!!fe.name} />
        {fe.name ? <p className="error small">{fe.name}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="c-contact">Phone or email</label>
        <input id="c-contact" name="contact" type="text" autoComplete="email" required maxLength={254} aria-invalid={!!fe.contact} />
        {fe.contact ? <p className="error small">{fe.contact}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="c-message">Message</label>
        <textarea id="c-message" name="message" required maxLength={4000} defaultValue={about ? `About: ${about}\n` : ""} aria-invalid={!!fe.message} />
        {fe.message ? <p className="error small">{fe.message}</p> : null}
      </div>
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="c-website">Leave empty</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
