/** Money is always integer cents. The currency code comes from settings and may be unset. */

export function formatMoney(cents: number, currency: string | null | undefined): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  const amount = `${sign}${whole}.${frac}`;
  return currency ? `${currency} ${amount}` : amount;
}

/**
 * Parses what a person types into a price box ("45", "45.5", "45,50", "1,250.00")
 * into cents. Returns null for anything ambiguous or negative.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  let normalised: string;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) normalised = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) normalised = s.replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(s)) normalised = s;
  else return null;
  const [whole, frac = ""] = normalised.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}
