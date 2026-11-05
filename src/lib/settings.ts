export interface Settings {
  business_name: string | null;
  tagline: string | null;
  about: string | null;
  currency: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  address: string | null;
  opening_hours: string | null;
  pickup_enabled: boolean;
  pickup_instructions: string | null;
  delivery_enabled: boolean;
  delivery_fee_cents: number | null;
  free_delivery_threshold_cents: number | null;
  delivery_areas: string | null;
  low_stock_threshold: number;
  returns_policy: string | null;
  privacy_policy: string | null;
  terms: string | null;
}

export const EMPTY_SETTINGS: Settings = {
  business_name: null,
  tagline: null,
  about: null,
  currency: null,
  phone: null,
  whatsapp: null,
  email: null,
  instagram: null,
  address: null,
  opening_hours: null,
  pickup_enabled: true,
  pickup_instructions: null,
  delivery_enabled: false,
  delivery_fee_cents: null,
  free_delivery_threshold_cents: null,
  delivery_areas: null,
  low_stock_threshold: 2,
  returns_policy: null,
  privacy_policy: null,
  terms: null,
};

export const SETTINGS_COLUMNS = Object.keys(EMPTY_SETTINGS).join(", ");

/** The name to show. The business name is the one fact we know for certain. */
export const displayName = (s: Settings) => s.business_name?.trim() || "Palms in Paradise";
