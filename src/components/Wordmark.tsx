import Link from "next/link";
import { PalmMark } from "./icons";

/** "PALMS IN PARADISE / ARUBA". Uses the business name from settings when set. */
export function Wordmark({ name }: { name: string }) {
  const m = name.match(/^(.*?)\s*,?\s*(Aruba)$/i);
  const main = m ? m[1] : name;
  return (
    <Link href="/" className="wordmark" aria-label={`${name}, home`}>
      <PalmMark />
      <span className="name">
        {main}
        <span className="place">Aruba</span>
      </span>
    </Link>
  );
}
