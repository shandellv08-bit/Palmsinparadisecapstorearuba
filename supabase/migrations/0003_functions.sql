-- Palms in Paradise: money and stock logic.
-- Everything that changes stock or order totals runs here, in one transaction,
-- with prices read from the database (never from the browser).
-- The same rules exist as pure functions in src/lib/engine and tests check
-- that both agree.

-- ---------------------------------------------------------------- audit
create function public.log_audit(p_action text, p_entity text default null, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), left(p_action, 80), left(p_entity, 40), left(p_entity_id, 80), coalesce(p_details, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------- order rules
create function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new'       then p_to in ('confirmed', 'ready', 'cancelled')
    when 'confirmed' then p_to in ('ready', 'cancelled')
    when 'ready'     then p_to in ('completed', 'cancelled')
    else false
  end
$$;

create function public.delivery_fee_for(p_subtotal int, p_fee int, p_threshold int)
returns int language sql immutable set search_path = '' as $$
  select case
    when p_threshold is not null and p_subtotal >= p_threshold then 0
    else coalesce(p_fee, 0)
  end
$$;

create function public.phone_key(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$$;

-- ---------------------------------------------------------------- place_order
-- Called by the public checkout. payload:
-- { customer: {name, phone, email?}, fulfilment: 'pickup'|'delivery',
--   delivery_address?, note?, items: [{variant_id, quantity}] }
create function public.place_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s            public.settings;
  v_name       text := btrim(coalesce(payload #>> '{customer,name}', ''));
  v_phone      text := btrim(coalesce(payload #>> '{customer,phone}', ''));
  v_email      text := nullif(btrim(coalesce(payload #>> '{customer,email}', '')), '');
  v_fulfil_txt text := payload ->> 'fulfilment';
  v_fulfil     public.fulfilment;
  v_address    text := nullif(btrim(coalesce(payload ->> 'delivery_address', '')), '');
  v_note       text := nullif(btrim(coalesce(payload ->> 'note', '')), '');
  v_key        text;
  v_customer   uuid;
  v_order      public.orders;
  v_subtotal   int := 0;
  v_fee        int := 0;
  v_requested  int;
  v_found      int := 0;
  v_item_id    uuid;
  r            record;
begin
  -- shape checks
  if char_length(v_name) not between 1 and 120 then raise exception 'invalid_name'; end if;
  v_key := public.phone_key(v_phone);
  if v_key is null or char_length(v_key) not between 7 and 15 then raise exception 'invalid_phone'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  if v_fulfil_txt not in ('pickup', 'delivery') then raise exception 'invalid_fulfilment'; end if;
  v_fulfil := v_fulfil_txt::public.fulfilment;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'invalid_note'; end if;
  if jsonb_typeof(payload -> 'items') <> 'array'
     or jsonb_array_length(payload -> 'items') not between 1 and 20 then
    raise exception 'invalid_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'items') x
    where jsonb_typeof(x -> 'quantity') <> 'number'
       or (x ->> 'quantity')::numeric <> floor((x ->> 'quantity')::numeric)
       or (x ->> 'quantity')::int not between 1 and 10
       or coalesce(x ->> 'variant_id', '') !~ '^[0-9a-f-]{36}$'
  ) then
    raise exception 'invalid_items';
  end if;

  select * into s from public.settings where id = 1;
  if v_fulfil = 'pickup' and not s.pickup_enabled then raise exception 'pickup_unavailable'; end if;
  if v_fulfil = 'delivery' then
    if not s.delivery_enabled or s.delivery_fee_cents is null then raise exception 'delivery_unavailable'; end if;
    if v_address is null or char_length(v_address) > 300 then raise exception 'invalid_address'; end if;
  else
    v_address := null;
  end if;

  -- customer: recognise by phone number
  insert into public.customers as c (name, phone, phone_key, email)
  values (v_name, v_phone, v_key, v_email)
  on conflict (phone_key) do update
    set email = coalesce(c.email, excluded.email)
  returning id into v_customer;

  if (select count(*) from public.orders o
      where o.customer_id = v_customer and o.created_at > now() - interval '1 hour'
        and o.status <> 'cancelled') >= 5 then
    raise exception 'too_many_orders';
  end if;

  -- lock the variants in a fixed order so two checkouts cannot oversell
  create temporary table if not exists pg_temp.pip_cart (variant_id uuid primary key, quantity int) on commit drop;
  truncate pg_temp.pip_cart;
  insert into pg_temp.pip_cart
    select (x ->> 'variant_id')::uuid, sum((x ->> 'quantity')::int)
    from jsonb_array_elements(payload -> 'items') x group by 1;
  select count(*) into v_requested from pg_temp.pip_cart;

  for r in
    select v.id as variant_id, v.size, v.stock, p.id as product_id, p.name, p.price_cents, p.status, c.quantity
    from pg_temp.pip_cart c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    order by v.id
    for update of v
  loop
    v_found := v_found + 1;
    if r.status <> 'active' then
      raise exception 'unavailable' using detail = r.variant_id::text;
    end if;
    if r.quantity > 10 then raise exception 'invalid_items'; end if;
    if r.stock < r.quantity then
      raise exception 'out_of_stock' using detail = r.variant_id::text;
    end if;
    v_subtotal := v_subtotal + r.price_cents * r.quantity;
  end loop;
  if v_found <> v_requested then raise exception 'unavailable'; end if;

  if v_fulfil = 'delivery' then
    v_fee := public.delivery_fee_for(v_subtotal, s.delivery_fee_cents, s.free_delivery_threshold_cents);
  end if;

  insert into public.orders (customer_id, fulfilment, delivery_address, customer_note, currency,
                             subtotal_cents, delivery_fee_cents, total_cents)
  values (v_customer, v_fulfil, v_address, v_note, s.currency, v_subtotal, v_fee, v_subtotal + v_fee)
  returning * into v_order;

  perform set_config('pip.stock_write', 'on', true);
  for r in
    select v.id as variant_id, v.size, p.id as product_id, p.name, p.price_cents, c.quantity, pc.cost_cents
    from pg_temp.pip_cart c
    join public.product_variants v on v.id = c.variant_id
    join public.products p on p.id = v.product_id
    left join public.product_costs pc on pc.product_id = p.id
    order by p.name, v.sort
  loop
    insert into public.order_items (order_id, product_id, variant_id, product_name, size, unit_price_cents, quantity)
    values (v_order.id, r.product_id, r.variant_id, r.name, r.size, r.price_cents, r.quantity)
    returning id into v_item_id;
    if r.cost_cents is not null then
      insert into public.order_item_costs (order_item_id, unit_cost_cents) values (v_item_id, r.cost_cents);
    end if;
    with upd as (
      update public.product_variants set stock = stock - r.quantity where id = r.variant_id returning stock
    )
    insert into public.inventory_movements (variant_id, change, stock_after, reason, order_id)
    select r.variant_id, -r.quantity, upd.stock, 'order', v_order.id from upd;
  end loop;
  perform set_config('pip.stock_write', '', true);

  insert into public.order_events (order_id, kind, note) values (v_order.id, 'placed', null);

  return jsonb_build_object(
    'id', v_order.id,
    'number', v_order.number,
    'token', v_order.public_token,
    'total_cents', v_order.total_cents,
    'currency', v_order.currency
  );
end $$;

-- ---------------------------------------------------------------- receipt
-- The customer's confirmation page. Needs the unguessable token; returns no
-- personal data and no costs.
create function public.get_order_receipt(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', o.number,
    'status', o.status,
    'payment_status', o.payment_status,
    'fulfilment', o.fulfilment,
    'currency', o.currency,
    'subtotal_cents', o.subtotal_cents,
    'delivery_fee_cents', o.delivery_fee_cents,
    'total_cents', o.total_cents,
    'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.product_name, 'size', i.size,
                                          'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents)
                       order by i.product_name, i.size)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where p_token ~ '^[0-9a-f]{36}$' and o.public_token = p_token
$$;

-- ---------------------------------------------------------------- staff: orders
create function public.set_order_status(p_order uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from public.order_status;
begin
  if not public.staff_can('orders') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status = 'cancelled' then raise exception 'use_cancel_order'; end if;
  select status into v_from from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if not public.order_transition_allowed(v_from, p_status) then
    raise exception 'invalid_transition' using detail = v_from || ' -> ' || p_status;
  end if;
  update public.orders set status = p_status where id = p_order;
  insert into public.order_events (order_id, kind, note, actor)
  values (p_order, 'status:' || p_status, left(p_note, 500), auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'order.status', 'order', p_order::text, jsonb_build_object('from', v_from, 'to', p_status));
end $$;

create function public.cancel_order(p_order uuid, p_restock boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.order_status;
  r record;
begin
  if not public.staff_can('orders') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select status into v_status from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if v_status in ('cancelled', 'completed') then
    raise exception 'cannot_cancel' using detail = v_status::text;
  end if;

  if p_restock then
    perform set_config('pip.stock_write', 'on', true);
    for r in
      select i.variant_id, sum(i.quantity)::int as quantity
      from public.order_items i
      join public.product_variants v on v.id = i.variant_id
      where i.order_id = p_order
      group by i.variant_id
      order by i.variant_id
    loop
      with upd as (
        update public.product_variants set stock = stock + r.quantity where id = r.variant_id returning stock
      )
      insert into public.inventory_movements (variant_id, change, stock_after, reason, order_id, actor)
      select r.variant_id, r.quantity, upd.stock, 'cancel', p_order, auth.uid() from upd;
    end loop;
    perform set_config('pip.stock_write', '', true);
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order;
  insert into public.order_events (order_id, kind, note, actor)
  values (p_order, case when p_restock then 'cancelled:restocked' else 'cancelled' end, left(p_reason, 500), auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'order.cancel', 'order', p_order::text,
          jsonb_build_object('restock', p_restock, 'from', v_status));
end $$;

create function public.set_payment_status(p_order uuid, p_status public.payment_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from public.payment_status;
begin
  if not public.staff_can('orders') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status = 'refunded' and not public.staff_can('finance') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select payment_status into v_from from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if v_from = p_status then return; end if;
  if v_from = 'refunded' then raise exception 'invalid_transition'; end if;
  update public.orders set payment_status = p_status where id = p_order;
  insert into public.order_events (order_id, kind, note, actor)
  values (p_order, 'payment:' || p_status, left(p_note, 500), auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'order.payment', 'order', p_order::text, jsonb_build_object('from', v_from, 'to', p_status));
end $$;

-- ---------------------------------------------------------------- staff: stock
create function public.adjust_stock(p_variant uuid, p_change int, p_reason public.movement_reason, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_stock int;
begin
  if not public.staff_can('inventory') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_reason in ('order', 'cancel') then raise exception 'invalid_reason'; end if;
  if p_change = 0 or abs(p_change) > 10000 then raise exception 'invalid_change'; end if;
  select stock into v_stock from public.product_variants where id = p_variant for update;
  if not found then raise exception 'not_found'; end if;
  if v_stock + p_change < 0 then raise exception 'negative_stock' using detail = v_stock::text; end if;

  perform set_config('pip.stock_write', 'on', true);
  update public.product_variants set stock = v_stock + p_change where id = p_variant;
  perform set_config('pip.stock_write', '', true);

  insert into public.inventory_movements (variant_id, change, stock_after, reason, note, actor)
  values (p_variant, p_change, v_stock + p_change, p_reason, left(p_note, 500), auth.uid());
  return v_stock + p_change;
end $$;

-- ---------------------------------------------------------------- contact form
create function public.submit_contact(p_name text, p_contact text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_contact, ''))) not between 3 and 254
     or char_length(btrim(coalesce(p_message, ''))) not between 1 and 4000 then
    raise exception 'invalid_message';
  end if;
  -- crude flood guard; Turnstile on the form is the real defence
  if (select count(*) from public.contact_messages where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'busy';
  end if;
  insert into public.contact_messages (name, contact, message)
  values (btrim(p_name), btrim(p_contact), btrim(p_message));
end $$;

-- ---------------------------------------------------------------- grants
-- Supabase grants execute on new functions to anon and authenticated by
-- default. Remove all of it, then grant back exactly what each caller needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.staff_can(text), public.is_staff(), public.current_staff_role(),
  public.role_can(public.staff_role, text) to authenticated;
grant execute on function public.place_order(jsonb), public.get_order_receipt(text),
  public.submit_contact(text, text, text) to anon, authenticated;
grant execute on function public.log_audit(text, text, text, jsonb),
  public.set_order_status(uuid, public.order_status, text),
  public.cancel_order(uuid, boolean, text),
  public.set_payment_status(uuid, public.payment_status, text),
  public.adjust_stock(uuid, int, public.movement_reason, text),
  public.order_transition_allowed(public.order_status, public.order_status),
  public.delivery_fee_for(int, int, int)
  to authenticated;
