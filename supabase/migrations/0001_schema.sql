-- Palms in Paradise: core data model.
-- Money is stored as integer cents. The currency code lives in settings.
-- Costs are kept in separate tables (product_costs, order_item_costs) so that
-- row-level security can hide them completely from customers and from staff
-- without finance access.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.staff_role as enum ('owner', 'manager', 'inventory', 'support');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('new', 'confirmed', 'ready', 'completed', 'cancelled');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.fulfilment as enum ('pickup', 'delivery');
create type public.movement_reason as enum ('initial', 'restock', 'adjustment', 'order', 'cancel', 'damaged');
create type public.message_status as enum ('new', 'handled');
create type public.customer_status as enum ('active', 'blocked');

-- ---------------------------------------------------------------- staff
create table public.staff (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254),
  role        public.staff_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings
-- One row. Every business fact is nullable: if Shan has not entered it,
-- the site shows "not set" instead of inventing something.
create table public.settings (
  id                            int primary key default 1 check (id = 1),
  business_name                 text check (char_length(business_name) <= 120),
  tagline                       text check (char_length(tagline) <= 200),
  about                         text check (char_length(about) <= 4000),
  currency                      text check (currency ~ '^[A-Z]{3}$'),
  phone                         text check (char_length(phone) <= 40),
  whatsapp                      text check (char_length(whatsapp) <= 40),
  email                         text check (char_length(email) <= 254),
  instagram                     text check (char_length(instagram) <= 60),
  address                       text check (char_length(address) <= 300),
  opening_hours                 text check (char_length(opening_hours) <= 600),
  pickup_enabled                boolean not null default true,
  pickup_instructions           text check (char_length(pickup_instructions) <= 1000),
  delivery_enabled              boolean not null default false,
  delivery_fee_cents            int check (delivery_fee_cents >= 0),
  free_delivery_threshold_cents int check (free_delivery_threshold_cents >= 0),
  delivery_areas                text check (char_length(delivery_areas) <= 1000),
  low_stock_threshold           int not null default 2 check (low_stock_threshold between 0 and 1000),
  returns_policy                text check (char_length(returns_policy) <= 8000),
  privacy_policy                text check (char_length(privacy_policy) <= 8000),
  terms                         text check (char_length(terms) <= 8000),
  updated_at                    timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------- catalogue
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name         text not null check (char_length(name) between 1 and 120),
  team         text check (char_length(team) <= 80),
  style        text check (char_length(style) <= 80),
  colour       text check (char_length(colour) <= 60),
  description  text check (char_length(description) <= 4000),
  price_cents  int not null check (price_cents >= 0 and price_cents <= 10000000),
  status       public.product_status not null default 'draft',
  featured     boolean not null default false,
  images       text[] not null default '{}' check (cardinality(images) <= 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.product_costs (
  product_id  uuid primary key references public.products (id) on delete cascade,
  cost_cents  int not null check (cost_cents >= 0 and cost_cents <= 10000000),
  updated_at  timestamptz not null default now()
);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  size        text not null check (char_length(size) between 1 and 20),
  sku         text check (char_length(sku) <= 60),
  stock       int not null default 0 check (stock >= 0),
  sort        int not null default 0,
  unique (product_id, size)
);
create index on public.product_variants (product_id);

-- ---------------------------------------------------------------- customers
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  phone          text check (char_length(phone) <= 40),
  phone_key      text unique,           -- digits only, used to recognise returning customers
  email          text check (char_length(email) <= 254),
  notes          text check (char_length(notes) <= 4000),
  status         public.customer_status not null default 'active',
  anonymised_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  number              bigint generated always as identity (start with 1001) unique,
  public_token        text not null unique default encode(gen_random_bytes(18), 'hex'),
  customer_id         uuid references public.customers (id) on delete set null,
  status              public.order_status not null default 'new',
  payment_status      public.payment_status not null default 'unpaid',
  fulfilment          public.fulfilment not null,
  delivery_address    text check (char_length(delivery_address) <= 300),
  customer_note       text check (char_length(customer_note) <= 1000),
  currency            text,
  subtotal_cents      int not null check (subtotal_cents >= 0),
  delivery_fee_cents  int not null default 0 check (delivery_fee_cents >= 0),
  total_cents         int not null check (total_cents = subtotal_cents + delivery_fee_cents),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  constraint delivery_needs_address check (fulfilment = 'pickup' or delivery_address is not null)
);
create index on public.orders (created_at desc);
create index on public.orders (customer_id);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  variant_id        uuid references public.product_variants (id) on delete set null,
  product_name      text not null,
  size              text not null,
  unit_price_cents  int not null check (unit_price_cents >= 0),
  quantity          int not null check (quantity between 1 and 50)
);
create index on public.order_items (order_id);

create table public.order_item_costs (
  order_item_id    uuid primary key references public.order_items (id) on delete cascade,
  unit_cost_cents  int not null check (unit_cost_cents >= 0)
);

-- Timeline shown on the order detail page.
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        text not null,
  note        text,
  actor       uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------- inventory
create table public.inventory_movements (
  id          bigint generated always as identity primary key,
  variant_id  uuid references public.product_variants (id) on delete set null,
  change      int not null check (change <> 0),
  stock_after int not null,
  reason      public.movement_reason not null,
  order_id    uuid references public.orders (id) on delete set null,
  note        text check (char_length(note) <= 500),
  actor       uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.inventory_movements (variant_id, created_at desc);

-- ---------------------------------------------------------------- messages
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  contact     text not null check (char_length(contact) between 3 and 254),
  message     text not null check (char_length(message) between 1 and 4000),
  status      public.message_status not null default 'new',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid references auth.users (id) on delete set null,
  action      text not null check (char_length(action) <= 80),
  entity      text check (char_length(entity) <= 40),
  entity_id   text check (char_length(entity_id) <= 80),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

-- ---------------------------------------------------------------- updated_at
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
