-- Palms in Paradise: storefront additions.
-- An optional announcement line shown above the header (empty = hidden).
alter table public.settings
  add column announcement text check (char_length(announcement) <= 200);
