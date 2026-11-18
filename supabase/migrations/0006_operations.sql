-- Palms in Paradise: running the company.
-- Live chat (customer service line), tasks, notifications, time clock,
-- suppliers and purchase orders, expenses, sales goal, customer care tools.
--
-- Updated area matrix (must match src/lib/engine/permissions.ts):
--   area        owner manager inventory support
--   dashboard     x      x        x        x
--   tasks         x      x        x        x
--   hours         x      x        x        x
--   products      x      x        x
--   inventory     x      x        x
--   orders        x      x        x        x
--   customers     x      x                 x
--   messages      x      x                 x     (contact form + live chat)
--   purchasing    x      x
--   finance       x      x                       (costs, margin, expenses)
--   reports       x      x
--   settings      x      x
--   team          x

create or replace function public.role_can(r public.staff_role, area text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when r is null then false
    when r = 'owner' then area in ('dashboard','tasks','hours','products','inventory','orders','customers','messages','purchasing','finance','reports','settings','team')
    when r = 'manager' then area in ('dashboard','tasks','hours','products','inventory','orders','customers','messages','purchasing','finance','reports','settings')
    when r = 'inventory' then area in ('dashboard','tasks','hours','products','inventory','orders')
    when r = 'support' then area in ('dashboard','tasks','hours','orders','customers','messages')
    else false
  end
$$;

-- Owner or manager: the people who run the business day to day.
create function public.is_lead() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_staff_role() in ('owner', 'manager')
$$;

-- Business goals are private (settings is publicly readable, so they live here).
create table public.goals (
  id                          int primary key default 1 check (id = 1),
  monthly_sales_target_cents  int check (monthly_sales_target_cents >= 0),
  updated_at                  timestamptz not null default now()
);
insert into public.goals (id) values (1);
alter table public.goals enable row level security;
grant select, update on public.goals to authenticated;
create policy goals_read on public.goals for select to authenticated using (public.staff_can('finance'));
create policy goals_update on public.goals for update to authenticated
  using (public.staff_can('finance')) with check (public.staff_can('finance'));

-- ================================================================ notifications
create table public.notifications (
  id          bigint generated always as identity primary key,
  recipient   uuid not null references public.staff (user_id) on delete cascade,
  kind        text not null,
  title       text not null check (char_length(title) <= 200),
  link        text check (link ~ '^/admin'),
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (recipient, dedupe_key)
);
create index on public.notifications (recipient, read_at, created_at desc);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using (recipient = auth.uid());

-- One notification per person per dedupe key: repeats are silently skipped.
create function public.notify_user(p_user uuid, p_kind text, p_title text, p_link text, p_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient, kind, title, link, dedupe_key)
  select s.user_id, p_kind, left(p_title, 200), p_link, p_key
  from public.staff s where s.user_id = p_user and s.active
  on conflict (recipient, dedupe_key) do nothing
$$;

create function public.notify_area(p_area text, p_kind text, p_title text, p_link text, p_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient, kind, title, link, dedupe_key)
  select s.user_id, p_kind, left(p_title, 200), p_link, p_key
  from public.staff s where s.active and public.role_can(s.role, p_area)
  on conflict (recipient, dedupe_key) do nothing
$$;

create function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where recipient = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- new order
create function public.on_order_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_area('orders', 'order.new', 'New order PIP-' || new.number, '/admin/orders/' || new.id, 'order:' || new.id);
  return new;
end $$;
create trigger orders_notify after insert on public.orders for each row execute function public.on_order_created();

-- sold out / running low (at most once per size per day each)
create function public.on_stock_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_threshold int;
begin
  if new.stock >= old.stock then return new; end if;
  select p.name into v_name from public.products p where p.id = new.product_id;
  select low_stock_threshold into v_threshold from public.settings where id = 1;
  if new.stock = 0 then
    perform public.notify_area('inventory', 'stock.out', 'Sold out: ' || v_name || ', size ' || new.size,
      '/admin/products/' || new.product_id, 'out:' || new.id || ':' || current_date);
  elsif new.stock <= v_threshold and old.stock > v_threshold then
    perform public.notify_area('inventory', 'stock.low', 'Low stock: ' || v_name || ', size ' || new.size || ' (' || new.stock || ' left)',
      '/admin/products/' || new.product_id, 'low:' || new.id || ':' || current_date);
  end if;
  return new;
end $$;
create trigger variants_notify after update of stock on public.product_variants
  for each row execute function public.on_stock_changed();

-- contact form message
create function public.on_contact_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_area('messages', 'message.new', 'New message from ' || new.name, '/admin/messages', 'contact:' || new.id);
  return new;
end $$;
create trigger contact_notify after insert on public.contact_messages for each row execute function public.on_contact_message();

-- ================================================================ live chat
create type public.chat_sender as enum ('customer', 'staff', 'ai', 'system');
create type public.conversation_status as enum ('open', 'closed');

create table public.conversations (
  id                uuid primary key default gen_random_uuid(),
  public_token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  customer_name     text not null check (char_length(customer_name) between 1 and 120),
  customer_contact  text check (char_length(customer_contact) <= 254),
  status            public.conversation_status not null default 'open',
  needs_human       boolean not null default true,
  ai_enabled        boolean not null default false,
  assigned_to       uuid references public.staff (user_id) on delete set null,
  unread_by_staff   boolean not null default true,
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now()
);
create index on public.conversations (status, last_message_at desc);

create table public.chat_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender           public.chat_sender not null,
  staff_id         uuid references public.staff (user_id) on delete set null,
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index on public.chat_messages (conversation_id, id);

alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
grant select on public.conversations, public.chat_messages to authenticated;
create policy conversations_staff on public.conversations for select to authenticated using (public.staff_can('messages'));
create policy chat_messages_staff on public.chat_messages for select to authenticated using (public.staff_can('messages'));

-- Customer side. The token is the customer's only key to their conversation.
create function public.start_chat(p_name text, p_contact text, p_body text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_conv public.conversations;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_contact := nullif(btrim(coalesce(p_contact, '')), '');
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_name) not between 1 and 120 or char_length(p_body) not between 1 and 2000
     or (p_contact is not null and char_length(p_contact) > 254) then
    raise exception 'invalid_message';
  end if;
  if (select count(*) from public.conversations where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'busy';
  end if;
  insert into public.conversations (customer_name, customer_contact) values (p_name, p_contact) returning * into v_conv;
  insert into public.chat_messages (conversation_id, sender, body) values (v_conv.id, 'customer', p_body);
  perform public.notify_area('messages', 'chat.new', 'New chat from ' || p_name, '/admin/inbox/' || v_conv.id, 'chat:' || v_conv.id || ':start');
  return v_conv.public_token;
end $$;

create function public.chat_send(p_token text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_conv public.conversations;
begin
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) not between 1 and 2000 then raise exception 'invalid_message'; end if;
  select * into v_conv from public.conversations where p_token ~ '^[0-9a-f]{48}$' and public_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if (select count(*) from public.chat_messages
      where conversation_id = v_conv.id and sender = 'customer' and created_at > now() - interval '5 minutes') >= 15 then
    raise exception 'slow_down';
  end if;
  insert into public.chat_messages (conversation_id, sender, body) values (v_conv.id, 'customer', p_body);
  update public.conversations
    set status = 'open', unread_by_staff = true, last_message_at = now(),
        needs_human = case when ai_enabled then needs_human else true end
    where id = v_conv.id;
  -- one alert per conversation per hour, not one per message
  if v_conv.assigned_to is not null then
    perform public.notify_user(v_conv.assigned_to, 'chat.new', 'New chat message from ' || v_conv.customer_name,
      '/admin/inbox/' || v_conv.id, 'chat:' || v_conv.id || ':' || to_char(now(), 'YYYYMMDDHH24'));
  else
    perform public.notify_area('messages', 'chat.new', 'New chat message from ' || v_conv.customer_name,
      '/admin/inbox/' || v_conv.id, 'chat:' || v_conv.id || ':' || to_char(now(), 'YYYYMMDDHH24'));
  end if;
end $$;

-- What the customer sees: their messages and replies, staff shown by first name only.
create function public.chat_fetch(p_token text, p_after bigint default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', c.status,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at,
               'staff_name', case when m.sender = 'staff' then split_part(s.full_name, ' ', 1) end)
             order by m.id)
      from public.chat_messages m left join public.staff s on s.user_id = m.staff_id
      where m.conversation_id = c.id and m.id > coalesce(p_after, 0)), '[]'::jsonb))
  from public.conversations c
  where p_token ~ '^[0-9a-f]{48}$' and c.public_token = p_token
$$;

-- Staff side. Replying takes the conversation over: any assistant stops answering it.
create function public.chat_reply(p_conv uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('messages') then raise exception 'not_allowed' using errcode = '42501'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) not between 1 and 2000 then raise exception 'invalid_message'; end if;
  update public.conversations
    set needs_human = false, ai_enabled = false, unread_by_staff = false, last_message_at = now(),
        assigned_to = coalesce(assigned_to, auth.uid()), status = 'open'
    where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  insert into public.chat_messages (conversation_id, sender, staff_id, body) values (p_conv, 'staff', auth.uid(), p_body);
end $$;

create function public.chat_update(p_conv uuid, p_status public.conversation_status default null,
                                   p_assign_to uuid default null, p_mark_read boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('messages') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_assign_to is not null and not exists (select 1 from public.staff where user_id = p_assign_to and active and public.role_can(role, 'messages')) then
    raise exception 'invalid_assignee';
  end if;
  update public.conversations
    set status = coalesce(p_status, status),
        assigned_to = coalesce(p_assign_to, assigned_to),
        unread_by_staff = case when p_mark_read then false else unread_by_staff end,
        needs_human = case when p_status = 'closed' then false else needs_human end
    where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'closed' then
    insert into public.chat_messages (conversation_id, sender, body) values (p_conv, 'system', 'Conversation closed. Write again any time.');
  end if;
  if p_assign_to is not null and p_assign_to <> auth.uid() then
    perform public.notify_user(p_assign_to, 'chat.assigned', 'A chat was assigned to you', '/admin/inbox/' || p_conv, 'chatassign:' || p_conv || ':' || p_assign_to);
  end if;
end $$;

-- ================================================================ tasks
create type public.task_status as enum ('todo', 'doing', 'done');
create type public.task_priority as enum ('low', 'normal', 'high');

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  details      text check (char_length(details) <= 4000),
  status       public.task_status not null default 'todo',
  priority     public.task_priority not null default 'normal',
  due_on       date,
  assigned_to  uuid references public.staff (user_id) on delete set null,
  created_by   uuid references public.staff (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index on public.tasks (assigned_to, status);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create table public.task_comments (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author      uuid references public.staff (user_id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create table public.task_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor       uuid references public.staff (user_id) on delete set null,
  kind        text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_events enable row level security;
grant select on public.tasks, public.task_comments, public.task_events to authenticated;

create function public.can_see_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_can('tasks') and (public.is_lead() or exists (
    select 1 from public.tasks t where t.id = p_task and (t.assigned_to = auth.uid() or t.created_by = auth.uid())))
$$;
create policy tasks_read on public.tasks for select to authenticated using (public.can_see_task(id));
create policy task_comments_read on public.task_comments for select to authenticated using (public.can_see_task(task_id));
create policy task_events_read on public.task_events for select to authenticated using (public.can_see_task(task_id));

-- Leads assign to anyone; everyone else can only create tasks for themselves.
create function public.create_task(p_title text, p_details text, p_priority public.task_priority, p_due date, p_assignee uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.staff_can('tasks') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_assignee is null then p_assignee := auth.uid(); end if;
  if p_assignee <> auth.uid() and not public.is_lead() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where user_id = p_assignee and active) then raise exception 'invalid_assignee'; end if;
  insert into public.tasks (title, details, priority, due_on, assigned_to, created_by)
  values (btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), coalesce(p_priority, 'normal'), p_due, p_assignee, auth.uid())
  returning id into v_id;
  insert into public.task_events (task_id, actor, kind) values (v_id, auth.uid(), 'created');
  if p_assignee <> auth.uid() then
    perform public.notify_user(p_assignee, 'task.assigned', 'New task: ' || btrim(p_title), '/admin/tasks/' || v_id, 'task:' || v_id || ':' || p_assignee);
  end if;
  return v_id;
end $$;

create function public.set_task_status(p_task uuid, p_status public.task_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.tasks;
begin
  select * into v from public.tasks where id = p_task for update;
  if not found then raise exception 'not_found'; end if;
  if not (public.is_lead() or v.assigned_to = auth.uid() or v.created_by = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v.status = p_status then return; end if;
  update public.tasks set status = p_status, done_at = case when p_status = 'done' then now() end where id = p_task;
  insert into public.task_events (task_id, actor, kind, detail) values (p_task, auth.uid(), 'status', v.status || ' -> ' || p_status);
  if p_status = 'done' and v.created_by is not null and v.created_by <> auth.uid() then
    perform public.notify_user(v.created_by, 'task.done', 'Done: ' || v.title, '/admin/tasks/' || p_task, 'taskdone:' || p_task);
  end if;
end $$;

create function public.update_task(p_task uuid, p_title text, p_details text, p_priority public.task_priority, p_due date, p_assignee uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.tasks;
begin
  select * into v from public.tasks where id = p_task for update;
  if not found then raise exception 'not_found'; end if;
  if not (public.is_lead() or v.created_by = auth.uid()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_assignee is distinct from v.assigned_to and p_assignee <> auth.uid() and not public.is_lead() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_assignee is not null and not exists (select 1 from public.staff where user_id = p_assignee and active) then raise exception 'invalid_assignee'; end if;
  update public.tasks set title = btrim(p_title), details = nullif(btrim(coalesce(p_details, '')), ''),
    priority = p_priority, due_on = p_due, assigned_to = p_assignee where id = p_task;
  insert into public.task_events (task_id, actor, kind) values (p_task, auth.uid(), 'edited');
  if p_assignee is distinct from v.assigned_to and p_assignee is not null then
    insert into public.task_events (task_id, actor, kind, detail) values (p_task, auth.uid(), 'assigned', p_assignee::text);
    if p_assignee <> auth.uid() then
      perform public.notify_user(p_assignee, 'task.assigned', 'Task for you: ' || btrim(p_title), '/admin/tasks/' || p_task, 'task:' || p_task || ':' || p_assignee);
    end if;
  end if;
end $$;

create function public.add_task_comment(p_task uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.tasks;
begin
  if not public.can_see_task(p_task) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'invalid_comment'; end if;
  select * into v from public.tasks where id = p_task;
  insert into public.task_comments (task_id, author, body) values (p_task, auth.uid(), btrim(p_body));
  -- tell the other person involved (once per hour per task)
  perform public.notify_user(x, 'task.comment', 'Comment on: ' || v.title, '/admin/tasks/' || p_task,
                             'taskc:' || p_task || ':' || to_char(now(), 'YYYYMMDDHH24'))
  from unnest(array[v.assigned_to, v.created_by]) x where x is not null and x <> auth.uid();
end $$;

-- ================================================================ time clock
create table public.time_entries (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.staff (user_id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  note        text check (char_length(note) <= 300),
  check (ended_at is null or ended_at > started_at)
);
create unique index time_entries_one_open on public.time_entries (user_id) where ended_at is null;
alter table public.time_entries enable row level security;
grant select on public.time_entries to authenticated;
create policy time_read on public.time_entries for select to authenticated
  using (public.staff_can('hours') and (user_id = auth.uid() or public.is_lead()));

create function public.clock_in() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('hours') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.time_entries where user_id = auth.uid() and ended_at is null) then
    raise exception 'already_clocked_in';
  end if;
  insert into public.time_entries (user_id) values (auth.uid());
end $$;

create function public.clock_out(p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.time_entries set ended_at = greatest(now(), started_at + interval '1 second'), note = left(nullif(btrim(coalesce(p_note, '')), ''), 300)
  where user_id = auth.uid() and ended_at is null;
  if not found then raise exception 'not_clocked_in'; end if;
end $$;

-- Owner corrects a forgotten clock-out or a wrong time. Logged.
create function public.fix_time_entry(p_id bigint, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('team') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'invalid_times'; end if;
  update public.time_entries set started_at = p_start, ended_at = p_end where id = p_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'hours.fix', 'time_entry', p_id::text, jsonb_build_object('start', p_start, 'end', p_end));
end $$;

-- ================================================================ purchasing
create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  contact_name    text check (char_length(contact_name) <= 120),
  phone           text check (char_length(phone) <= 40),
  email           text check (char_length(email) <= 254),
  website         text check (char_length(website) <= 200),
  lead_time_days  int check (lead_time_days between 0 and 365),
  notes           text check (char_length(notes) <= 4000),
  created_at      timestamptz not null default now()
);

create type public.po_status as enum ('draft', 'ordered', 'partly_received', 'received', 'cancelled');
create table public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity (start with 1) unique,
  supplier_id     uuid references public.suppliers (id) on delete set null,
  status          public.po_status not null default 'draft',
  ordered_on      date,
  expected_on     date,
  shipping_cents  int not null default 0 check (shipping_cents >= 0),
  notes           text check (char_length(notes) <= 4000),
  created_by      uuid references public.staff (user_id) on delete set null,
  created_at      timestamptz not null default now()
);
create table public.purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  po_id              uuid not null references public.purchase_orders (id) on delete cascade,
  variant_id         uuid not null references public.product_variants (id) on delete restrict,
  quantity_ordered   int not null check (quantity_ordered between 1 and 10000),
  quantity_received  int not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  unit_cost_cents    int check (unit_cost_cents >= 0),
  unique (po_id, variant_id)
);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
create policy suppliers_all on public.suppliers for all to authenticated
  using (public.staff_can('purchasing')) with check (public.staff_can('purchasing'));
create policy po_all on public.purchase_orders for all to authenticated
  using (public.staff_can('purchasing')) with check (public.staff_can('purchasing'));
-- lines can only be edited while the order is a draft; receiving goes through receive_po_item
create policy po_items_read on public.purchase_order_items for select to authenticated using (public.staff_can('purchasing'));
create policy po_items_ins on public.purchase_order_items for insert to authenticated
  with check (public.staff_can('purchasing') and quantity_received = 0
              and exists (select 1 from public.purchase_orders p where p.id = po_id and p.status = 'draft'));
create policy po_items_upd on public.purchase_order_items for update to authenticated
  using (public.staff_can('purchasing') and exists (select 1 from public.purchase_orders p where p.id = po_id and p.status = 'draft'))
  with check (quantity_received = 0);
create policy po_items_del on public.purchase_order_items for delete to authenticated
  using (public.staff_can('purchasing') and exists (select 1 from public.purchase_orders p where p.id = po_id and p.status = 'draft'));

-- What inventory staff see when a delivery arrives: no costs, no supplier terms.
create view public.incoming_deliveries with (security_barrier = true) as
  select i.id as item_id, po.id as po_id, po.number as po_number, po.expected_on, s.name as supplier_name,
         p.name as product_name, v.size, i.quantity_ordered, i.quantity_received
  from public.purchase_order_items i
  join public.purchase_orders po on po.id = i.po_id
  join public.product_variants v on v.id = i.variant_id
  join public.products p on p.id = v.product_id
  left join public.suppliers s on s.id = po.supplier_id
  where po.status in ('ordered', 'partly_received') and public.staff_can('inventory');
grant select on public.incoming_deliveries to authenticated;

create function public.set_po_status(p_po uuid, p_status public.po_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.purchase_orders;
begin
  if not public.staff_can('purchasing') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v from public.purchase_orders where id = p_po for update;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'ordered' and v.status = 'draft' then
    if not exists (select 1 from public.purchase_order_items where po_id = p_po) then raise exception 'empty_order'; end if;
    update public.purchase_orders set status = 'ordered', ordered_on = coalesce(ordered_on, current_date) where id = p_po;
  elsif p_status = 'cancelled' and v.status in ('draft', 'ordered', 'partly_received') then
    update public.purchase_orders set status = 'cancelled' where id = p_po;
  else
    raise exception 'invalid_transition';
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'po.status', 'purchase_order', p_po::text, jsonb_build_object('from', v.status, 'to', p_status));
end $$;

-- Receiving adds the caps to stock and logs a movement against the PO.
create function public.receive_po_item(p_item uuid, p_qty int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.purchase_order_items;
  po public.purchase_orders;
  v_stock int;
begin
  if not public.staff_can('inventory') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into i from public.purchase_order_items where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  select * into po from public.purchase_orders where id = i.po_id for update;
  if po.status not in ('ordered', 'partly_received') then raise exception 'not_receivable'; end if;
  if p_qty is null or p_qty < 1 or i.quantity_received + p_qty > i.quantity_ordered then raise exception 'invalid_quantity'; end if;

  update public.purchase_order_items set quantity_received = quantity_received + p_qty where id = p_item;
  perform set_config('pip.stock_write', 'on', true);
  update public.product_variants set stock = stock + p_qty where id = i.variant_id returning stock into v_stock;
  perform set_config('pip.stock_write', '', true);
  insert into public.inventory_movements (variant_id, change, stock_after, reason, note, actor)
  values (i.variant_id, p_qty, v_stock, 'restock', 'PO-' || po.number, auth.uid());

  update public.purchase_orders set status = case
      when not exists (select 1 from public.purchase_order_items where po_id = po.id and quantity_received < quantity_ordered) then 'received'
      else 'partly_received' end::public.po_status
    where id = po.id;
end $$;

-- ================================================================ expenses
create type public.expense_category as enum ('stock', 'shipping', 'marketing', 'rent', 'wages', 'fees', 'equipment', 'other');
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  spent_on      date not null default current_date,
  category      public.expense_category not null,
  amount_cents  int not null check (amount_cents > 0 and amount_cents <= 100000000),
  description   text not null check (char_length(description) between 1 and 300),
  created_by    uuid references public.staff (user_id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.expenses (spent_on desc);
alter table public.expenses enable row level security;
grant select, insert, update, delete on public.expenses to authenticated;
create policy expenses_all on public.expenses for all to authenticated
  using (public.staff_can('finance')) with check (public.staff_can('finance'));

-- ================================================================ customer care
-- Privacy request: remove what identifies the person, keep orders for the books.
create function public.anonymise_customer(p_customer uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_lead() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.customers set name = 'Removed', phone = null, phone_key = null, email = null, notes = null, anonymised_at = now()
  where id = p_customer and anonymised_at is null;
  if not found then raise exception 'not_found'; end if;
  update public.orders set delivery_address = case when delivery_address is null then null else 'Removed' end, customer_note = null
  where customer_id = p_customer;
  insert into public.audit_log (actor, action, entity, entity_id) values (auth.uid(), 'customer.anonymise', 'customer', p_customer::text);
end $$;

-- Same person with two records (e.g. two phone numbers): move everything to one.
create function public.merge_customers(p_keep uuid, p_remove uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.customers;
begin
  if not public.is_lead() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_keep = p_remove then raise exception 'same_customer'; end if;
  select * into r from public.customers where id = p_remove for update;
  if not found or not exists (select 1 from public.customers where id = p_keep) then raise exception 'not_found'; end if;
  update public.orders set customer_id = p_keep where customer_id = p_remove;
  update public.customers k set
    email = coalesce(k.email, r.email),
    notes = nullif(concat_ws(E'\n', k.notes, case when r.notes is not null then 'Merged: ' || r.notes end, 'Merged record had phone ' || coalesce(r.phone, 'none')), '')
  where k.id = p_keep;
  delete from public.customers where id = p_remove;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'customer.merge', 'customer', p_keep::text, jsonb_build_object('removed', p_remove));
end $$;

-- ================================================================ grants
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb), public.get_order_receipt(text),
  public.submit_contact(text, text, text),
  public.start_chat(text, text, text), public.chat_send(text, text), public.chat_fetch(text, bigint)
  to anon, authenticated;
grant execute on function
  public.staff_can(text), public.is_staff(), public.current_staff_role(), public.role_can(public.staff_role, text), public.is_lead(),
  public.log_audit(text, text, text, jsonb),
  public.set_order_status(uuid, public.order_status, text), public.cancel_order(uuid, boolean, text),
  public.set_payment_status(uuid, public.payment_status, text),
  public.adjust_stock(uuid, int, public.movement_reason, text),
  public.order_transition_allowed(public.order_status, public.order_status), public.delivery_fee_for(int, int, int),
  public.mark_notifications_read(bigint[]),
  public.chat_reply(uuid, text), public.chat_update(uuid, public.conversation_status, uuid, boolean),
  public.can_see_task(uuid), public.create_task(text, text, public.task_priority, date, uuid),
  public.set_task_status(uuid, public.task_status), public.update_task(uuid, text, text, public.task_priority, date, uuid),
  public.add_task_comment(uuid, text),
  public.clock_in(), public.clock_out(text), public.fix_time_entry(bigint, timestamptz, timestamptz),
  public.set_po_status(uuid, public.po_status), public.receive_po_item(uuid, int),
  public.anonymise_customer(uuid), public.merge_customers(uuid, uuid)
  to authenticated;
