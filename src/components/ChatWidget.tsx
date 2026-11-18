"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { fetchChat, sendChat, startChat, type ChatMessage } from "@/app/(site)/actions";
import { keepFormSubmit } from "./useKeepForm";
import { ChatIcon } from "./icons";
import { Sheet } from "./Sheet";

const KEY = "pip-chat-v1";
const read = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string | null) => {
  try {
    if (v) window.localStorage.setItem(KEY, v);
    else window.localStorage.removeItem(KEY);
  } catch {
    // private mode: chat still works until the page is closed
  }
};

/** Customer service line: a chat button on every store page. */
export function ChatWidget({ hours, businessName }: { hours: string | null; businessName: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [unseen, setUnseen] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const last = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  const [startState, startAction, starting] = useActionState(startChat, {});

  useEffect(() => setToken(read()), []);
  useEffect(() => {
    if (startState.token) {
      write(startState.token);
      setToken(startState.token);
    }
  }, [startState.token]);

  const poll = useCallback(async () => {
    if (!token) return;
    const r = await fetchChat(token, last.current);
    if (r.gone) {
      write(null);
      setToken(null);
      setMessages([]);
      last.current = 0;
      return;
    }
    if (r.status) setStatus(r.status);
    if (r.messages.length) {
      last.current = r.messages[r.messages.length - 1].id;
      setMessages((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      if (!open) setUnseen((n) => n + r.messages.filter((x) => x.sender !== "customer").length);
    }
  }, [token, open]);

  // poll every 5 s while open, every 30 s in the background, never when the tab is hidden
  useEffect(() => {
    if (!token) return;
    void poll();
    const t = setInterval(() => document.visibilityState === "visible" && void poll(), open ? 5000 : 30000);
    return () => clearInterval(t);
  }, [token, open, poll]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !draft.trim()) return;
    setSending(true);
    const r = await sendChat(token, draft);
    setSending(false);
    if (r.error) setSendError(r.error);
    else {
      setSendError(null);
      setDraft("");
      void poll();
    }
  }

  return (
    <>
      <button
        type="button"
        className="chat-launch"
        aria-label={unseen ? `Chat with us, ${unseen} new` : "Chat with us"}
        onClick={() => {
          setOpen(true);
          setUnseen(0);
        }}
        aria-haspopup="dialog"
      >
        <ChatIcon /> <span aria-hidden="true">Chat with us</span>
        {unseen ? <span className="count" aria-hidden="true">{unseen}</span> : null}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="right" title="Chat with us">
        <p className="small muted">
          A person from {businessName} replies here. Opening hours: {hours?.trim() || "not set"}. Never send card numbers or passwords in chat.
        </p>
        {!token ? (
          <form onSubmit={keepFormSubmit(startAction)} noValidate>
            {startState.error ? <p className="alert" role="alert">{startState.error}</p> : null}
            <div className="field">
              <label htmlFor="ch-name">Your name</label>
              <input id="ch-name" name="name" type="text" autoComplete="name" required maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="ch-contact">Phone or email (optional, so we can reach you if you leave)</label>
              <input id="ch-contact" name="contact" type="text" autoComplete="email" maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="ch-body">Your question</label>
              <textarea id="ch-body" name="body" required maxLength={2000} />
            </div>
            <div className="sr-only" aria-hidden="true">
              <label htmlFor="ch-web">Leave empty</label>
              <input id="ch-web" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <button className="btn papaya block" disabled={starting}>{starting ? "Starting…" : "Start chat"}</button>
          </form>
        ) : (
          <>
            <ol ref={list} className="thread" aria-live="polite" aria-label="Messages">
              {messages.map((m) => (
                <li key={m.id} className={m.sender === "customer" ? "mine" : m.sender}>
                  {m.body}
                  <span className="when">
                    {m.sender === "staff" ? `${m.staff_name ?? "Staff"} · ` : m.sender === "customer" ? "You · " : ""}
                    {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ol>
            {messages.length && messages.every((m) => m.sender === "customer") ? (
              <p className="small muted">Sent. We will reply here. You can close this and keep shopping; the chat stays on this device.</p>
            ) : null}
            {status === "closed" ? <p className="small muted">This chat was closed. Writing again reopens it.</p> : null}
            <form onSubmit={send} className="chat-send">
              <label htmlFor="ch-msg" className="sr-only">Message</label>
              <textarea id="ch-msg" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Write a message" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <button className="btn small" disabled={sending || !draft.trim()}>Send</button>
            </form>
            {sendError ? <p className="error small" role="alert">{sendError}</p> : null}
            <button type="button" className="linkbtn small" onClick={() => { write(null); setToken(null); setMessages([]); last.current = 0; }}>
              Start a new chat
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}
