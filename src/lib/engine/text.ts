/** Mirrors phone_key() in 0003_functions.sql: digits only, null if none. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const NOT_SET = "not set";

/** Missing business facts are shown as "not set", never invented. */
export function orNotSet(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : NOT_SET;
}
