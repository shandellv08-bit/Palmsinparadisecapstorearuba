"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { attachPhotos, requestUploadUrls } from "../../../manage";

const BUCKET = "product-photos";

/** Resizes in the browser (longest side 600 and 1600px, WebP), then uploads to signed URLs. */
async function toWebp(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot make WebP images. Try Chrome, Edge, Firefox or Safari 16+.");
  return blob;
}

export function PhotoUploader({ productId, supabaseUrl, anonKey, remaining }: { productId: string; supabaseUrl: string; anonKey: string; remaining: number }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const files = [...(input.current?.files ?? [])].slice(0, remaining);
    if (!files.length) return;
    if (files.some((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type))) {
      setError("Photos must be JPEG, PNG or WebP.");
      return;
    }
    if (files.some((f) => f.size > 25 * 1024 * 1024)) {
      setError("Each photo must be under 25 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStatus("Preparing…");
      const res = await requestUploadUrls(productId, files.length);
      if ("error" in res && res.error) throw new Error(res.error);
      const base = process.env.NEXT_PUBLIC_STORAGE_PROXY === "1" ? window.location.origin : supabaseUrl;
      const sb = supabaseBrowser(base, anonKey);
      const bases: string[] = [];
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${files.length}…`);
        const slot = res.uploads![i];
        for (const f of slot.files) {
          const blob = await toWebp(file, f.size);
          const { error: upErr } = await sb.storage.from(BUCKET).uploadToSignedUrl(f.path, f.token, blob, { contentType: "image/webp", upsert: false });
          if (upErr) throw new Error("Upload failed. Check your connection and try again.");
        }
        bases.push(slot.base);
      }
      const saved = await attachPhotos(productId, bases);
      if (saved.error) throw new Error(saved.error);
      setStatus(`${bases.length} photo${bases.length > 1 ? "s" : ""} added.`);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field" style={{ marginTop: "1rem" }}>
      <label htmlFor="photos">Add photos (up to {remaining})</label>
      <input id="photos" ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} />
      <p className="hint">Photos are resized to 1600 pixels and converted to WebP before upload.</p>
      <button type="button" className="btn small" onClick={upload} disabled={busy}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      <div aria-live="polite">
        {status ? <p className="small">{status}</p> : null}
        {error ? <p className="error small">{error}</p> : null}
      </div>
    </div>
  );
}
