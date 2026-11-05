-- Palms in Paradise: roles, row-level security, grants and public views.
--
-- Areas and who may use them. This matrix must match
-- src/lib/engine/permissions.ts (a database test checks they agree).
--
--   area        owner manager inventory support
--   dashboard     x      x        x        x
--   products      x      x        x
--   inventory     x      x        x
--   orders        x      x        x        x
--   customers     x      x                 x
--   messages      x      x                 x
--   finance       x      x
--   reports       x      x
--   settings      x      x
--   team          x

-- ---------------------------------------------------------------- helpers
create function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff s where s.user_id = auth.uid() and s.active
$$;

create function public.role_can(r public.staff_role, area text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when r is null then false
    when r = 'owner' then area in ('dashboard','products','inventory','orders','customers','messages','finance','reports','settings','team')
    when r = 'manager' then area in ('dashboard','products','inventory','orders','customers','messages','finance','reports','settings')
    when r = 'inventory' then area in ('dashboard','products','inventory','orders')
    when r = 'support' then area in ('dashboard','orders','customers','messages')
    else false
  end
$$;

create function public.staff_can(area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.role_can(public.current_staff_role(), area)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_staff_role() is not null
$$;

-- ---------------------------------------------------------------- lock down
-- Supabase grants broad table privileges to anon/authenticated by default.
-- Start from nothing and grant only what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function public.staff_can(text), public.is_staff(), public.current_staff_role(), public.role_can(public.staff_role, text)
  to authenticated;

alter table public.staff               enable row level security;
alter table public.settings            enable row level security;
alter table public.products            enable row level security;
alter table public.product_costs       enable row level security;
alter table public.product_variants    enable row level security;
alter table public.customers           enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.order_item_costs    enable row level security;
alter table public.order_events        enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.contact_messages    enable row level security;
alter table public.audit_log           enable row level security;

-- ---------------------------------------------------------------- staff
grant select on public.staff to authenticated;
create policy staff_read_self on public.staff for select to authenticated
  using (user_id = auth.uid() or public.staff_can('team') or public.staff_can('dashboard'));
-- Writes to staff happen only through the server (service role) after an owner check.

-- ---------------------------------------------------------------- settings
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
create policy settings_public_read on public.settings for select to anon, authenticated using (true);
create policy settings_manage on public.settings for update to authenticated
  using (public.staff_can('settings')) with check (public.staff_can('settings'));

-- ---------------------------------------------------------------- products
-- Customers never touch this table; they read public_products below.
grant select, insert, update, delete on public.products to authenticated;
create policy products_staff_read on public.products for select to authenticated using (public.is_staff());
create policy products_manage_ins on public.products for insert to authenticated with check (public.staff_can('products'));
create policy products_manage_upd on public.products for update to authenticated
  using (public.staff_can('products')) with check (public.staff_can('products'));
create policy products_manage_del on public.products for delete to authenticated using (public.staff_can('finance'));

grant select, insert, update, delete on public.product_costs to authenticated;
create policy costs_finance_all on public.product_costs for all to authenticated
  using (public.staff_can('finance')) with check (public.staff_can('finance'));

grant select, insert, update, delete on public.product_variants to authenticated;
create policy variants_staff_read on public.product_variants for select to authenticated using (public.is_staff());
create policy variants_manage_ins on public.product_variants for insert to authenticated with check (public.staff_can('products'));
create policy variants_manage_upd on public.product_variants for update to authenticated
  using (public.staff_can('products')) with check (public.staff_can('products'));
create policy variants_manage_del on public.product_variants for delete to authenticated using (public.staff_can('products'));

-- Stock may only change through adjust_stock / place_order / cancel_order,
-- which set pip.stock_write and log an inventory movement.
create function public.guard_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('pip.stock_write', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.stock <> 0 then
      raise exception 'stock must start at 0; use adjust_stock' using errcode = 'P0001';
    elsif tg_op = 'UPDATE' and new.stock is distinct from old.stock then
      raise exception 'stock can only change through adjust_stock' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger variants_guard_stock before insert or update on public.product_variants
  for each row execute function public.guard_stock();

-- ---------------------------------------------------------------- customers
grant select, update on public.customers to authenticated;
create policy customers_read on public.customers for select to authenticated using (public.staff_can('customers') or public.staff_can('orders'));
create policy customers_update on public.customers for update to authenticated
  using (public.staff_can('customers')) with check (public.staff_can('customers'));

-- ---------------------------------------------------------------- orders
-- Orders are created only by place_order(); status changes go through functions.
grant select on public.orders, public.order_items, public.order_events to authenticated;
create policy orders_read on public.orders for select to authenticated using (public.staff_can('orders'));
create policy order_items_read on public.order_items for select to authenticated using (public.staff_can('orders'));
create policy order_events_read on public.order_events for select to authenticated using (public.staff_can('orders'));

grant select on public.order_item_costs to authenticated;
create policy order_costs_read on public.order_item_costs for select to authenticated using (public.staff_can('finance'));

-- ---------------------------------------------------------------- inventory
grant select on public.inventory_movements to authenticated;
create policy movements_read on public.inventory_movements for select to authenticated using (public.staff_can('inventory'));

-- ---------------------------------------------------------------- messages
grant select, update on public.contact_messages to authenticated;
create policy messages_read on public.contact_messages for select to authenticated using (public.staff_can('messages'));
create policy messages_update on public.contact_messages for update to authenticated
  using (public.staff_can('messages')) with check (public.staff_can('messages'));

-- ---------------------------------------------------------------- audit
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.staff_can('finance'));
-- Inserts only through log_audit(); no updates or deletes for anyone.

-- ---------------------------------------------------------------- public views
-- The storefront reads only these. They run as their owner so they can see
-- the base tables, and they expose no cost, no exact stock and no drafts.
create view public.public_products with (security_barrier = true) as
  select p.id, p.slug, p.name, p.team, p.style, p.colour, p.description,
         p.price_cents, p.featured, p.images, p.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'in_stock', v.stock > 0)
                            order by v.sort, v.size)
           from public.product_variants v where v.product_id = p.id
         ), '[]'::jsonb) as variants,
         exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0) as in_stock
  from public.products p
  where p.status = 'active';

grant select on public.public_products to anon, authenticated;
