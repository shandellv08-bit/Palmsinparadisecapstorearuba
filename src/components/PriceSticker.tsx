import { formatMoney } from "@/lib/engine";

export function PriceSticker({ cents, currency, large = false }: { cents: number; currency: string | null; large?: boolean }) {
  const amount = formatMoney(cents, null);
  return (
    <span className={`sticker${large ? " large" : ""}`} aria-label={`Price ${formatMoney(cents, currency)}`}>
      <span aria-hidden="true">
        {currency ? <small>{currency}</small> : null}
        {amount}
      </span>
    </span>
  );
}
