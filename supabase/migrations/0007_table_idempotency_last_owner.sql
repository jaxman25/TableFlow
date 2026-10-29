-- 0007 - Table-scoped idempotency and last-owner protection
--
-- 1. Idempotency keys are generated per table (one cart per table or tablet).
--    The key was unique per restaurant, so the same key replayed from another
--    table returned the first table's order and its diner status token. The
--    unique index and the replay lookup are now scoped to the table.
--
-- 2. A restaurant must always keep at least one active owner. Managers already
--    cannot touch owners (0004); this closes the remaining path where the last
--    owner demotes or revokes themselves and locks everybody out.

drop index if exists public.orders_idempotency_unique;
create unique index orders_idempotency_unique
  on public.orders (table_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.place_order(
  p_table_token text,
  p_items jsonb,
  p_idempotency_key text,
  p_source text default 'qr',
  p_customer_note text default null
)
returns table (
  ok boolean,
  error_code text,
  error_detail text,
  order_id uuid,
  order_number text,
  public_token text,
  subtotal_minor bigint,
  total_minor bigint,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table record;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_note text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_existing public.orders%rowtype;
  v_order public.orders%rowtype;
  v_line_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_subtotal bigint;
  v_unavailable text;
begin
  if p_source not in ('qr', 'tablet') then
    return query select * from public.order_failure('invalid_source');
    return;
  end if;

  if char_length(v_key) < 8 or char_length(v_key) > 200 then
    return query select * from public.order_failure('invalid_idempotency_key');
    return;
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    return query select * from public.order_failure('invalid_note');
    return;
  end if;

  if p_table_token is null or char_length(p_table_token) < 20 or char_length(p_table_token) > 200 then
    return query select * from public.order_failure('invalid_table_token');
    return;
  end if;

  select
    t.id,
    t.restaurant_id,
    t.table_number,
    t.status as table_status,
    t.qr_token_expires_at,
    r.status as restaurant_status,
    r.currency
  into v_table
  from public.dining_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.qr_token_hash = encode(sha256(convert_to(p_table_token, 'utf8')), 'hex');

  if not found then
    return query select * from public.order_failure('invalid_table_token');
    return;
  end if;
  if v_table.table_status <> 'active' then
    return query select * from public.order_failure('table_unavailable');
    return;
  end if;
  if v_table.qr_token_expires_at is not null and v_table.qr_token_expires_at < now() then
    return query select * from public.order_failure('table_unavailable');
    return;
  end if;
  if v_table.restaurant_status <> 'active' then
    return query select * from public.order_failure('restaurant_unavailable');
    return;
  end if;

  select * into v_existing
  from public.orders o
  where o.table_id = v_table.id
    and o.idempotency_key = v_key;

  if found then
    return query
      select true, null::text, null::text, v_existing.id, v_existing.order_number,
             v_existing.public_token, v_existing.subtotal_minor, v_existing.total_minor,
             v_existing.status, v_existing.created_at;
    return;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return query select * from public.order_failure('invalid_items');
    return;
  end if;

  select count(*) into v_line_count from jsonb_array_elements(p_items);
  if v_line_count < 1 or v_line_count > 50 then
    return query select * from public.order_failure('invalid_items');
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e
    where jsonb_typeof(e) <> 'object'
       or (e ->> 'menu_item_id') is null
       or (e ->> 'menu_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (e ->> 'quantity') is null
       or (e ->> 'quantity') !~ '^[0-9]{1,2}$'
       or (e ->> 'quantity')::integer < 1
       or (e ->> 'quantity')::integer > 99
       or (e ? 'notes' and e ->> 'notes' is not null and char_length(e ->> 'notes') > 300)
  ) then
    return query select * from public.order_failure('invalid_items');
    return;
  end if;

  select mi.name into v_unavailable
  from jsonb_array_elements(p_items) as e
  join public.menu_items mi on mi.id = (e ->> 'menu_item_id')::uuid
  where mi.restaurant_id = v_table.restaurant_id
    and mi.is_available = false
  limit 1;

  if v_unavailable is not null then
    return query select * from public.order_failure('item_unavailable', v_unavailable);
    return;
  end if;

  select count(distinct (e ->> 'menu_item_id')::uuid) into v_distinct_count
  from jsonb_array_elements(p_items) as e;

  select count(*) into v_matched_count
  from (
    select distinct (e ->> 'menu_item_id')::uuid as id
    from jsonb_array_elements(p_items) as e
  ) ids
  join public.menu_items mi
    on mi.id = ids.id
   and mi.restaurant_id = v_table.restaurant_id;

  if v_matched_count <> v_distinct_count then
    return query select * from public.order_failure('invalid_menu_item');
    return;
  end if;

  select coalesce(sum(mi.price_minor * (e ->> 'quantity')::integer), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as e
  join public.menu_items mi
    on mi.id = (e ->> 'menu_item_id')::uuid
   and mi.restaurant_id = v_table.restaurant_id;

  insert into public.orders (
    restaurant_id, table_id, order_number, source, status, currency,
    subtotal_minor, charges_minor, total_minor, idempotency_key, customer_note
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    'O' || lpad(nextval('public.order_number_seq')::text, 4, '0'),
    p_source,
    'pending',
    v_table.currency,
    v_subtotal,
    0,
    v_subtotal,
    v_key,
    v_note
  )
  on conflict (table_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning * into v_order;

  if v_order.id is null then
    select * into v_order
    from public.orders o
    where o.table_id = v_table.id
      and o.idempotency_key = v_key;

    if v_order.id is null then
      return query select * from public.order_failure('order_conflict');
      return;
    end if;

    return query
      select true, null::text, null::text, v_order.id, v_order.order_number,
             v_order.public_token, v_order.subtotal_minor, v_order.total_minor,
             v_order.status, v_order.created_at;
    return;
  end if;

  insert into public.order_items (
    order_id, menu_item_id, item_name_snapshot, unit_price_minor,
    quantity, line_total_minor, notes
  )
  select
    v_order.id,
    mi.id,
    mi.name,
    mi.price_minor,
    (e ->> 'quantity')::integer,
    mi.price_minor * (e ->> 'quantity')::integer,
    nullif(btrim(coalesce(e ->> 'notes', '')), '')
  from jsonb_array_elements(p_items) as e
  join public.menu_items mi
    on mi.id = (e ->> 'menu_item_id')::uuid
   and mi.restaurant_id = v_table.restaurant_id;

  insert into public.order_status_events (restaurant_id, order_id, from_status, to_status, actor_id)
  values (v_order.restaurant_id, v_order.id, null, 'pending', auth.uid());

  insert into public.audit_logs (restaurant_id, actor_id, action, entity_type, entity_id, metadata_redacted)
  values (
    v_order.restaurant_id, auth.uid(), 'order.created', 'order', v_order.id,
    jsonb_build_object('source', p_source, 'table', v_table.table_number, 'total_minor', v_subtotal)
  );

  return query
    select true, null::text, null::text, v_order.id, v_order.order_number,
           v_order.public_token, v_order.subtotal_minor, v_order.total_minor,
           v_order.status, v_order.created_at;
end;
$$;
-- ---------------------------------------------------------------------------
-- Last active owner protection
-- ---------------------------------------------------------------------------
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $guard$
begin
  if old.role <> 'owner' or old.status <> 'active' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if not exists (
    select 1
      from public.restaurant_members m
     where m.restaurant_id = old.restaurant_id
       and m.id <> old.id
       and m.role = 'owner'
       and m.status = 'active'
  ) then
    raise exception 'last_owner_required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$guard$;

drop trigger if exists restaurant_members_last_owner on public.restaurant_members;
create trigger restaurant_members_last_owner
before update or delete on public.restaurant_members
for each row execute function public.protect_last_owner();
