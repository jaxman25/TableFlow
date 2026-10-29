-- Order domain functions.
--
-- These are the only write paths for orders. They run as the migration owner so
-- anonymous diners can place an order without direct table privileges, and every
-- input is validated here rather than in the browser.

-- ---------------------------------------------------------------------------
-- Resolve a QR/tablet token into public menu context.
-- ---------------------------------------------------------------------------
create or replace function public.get_table_context(p_table_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_table record;
begin
  if p_table_token is null or char_length(p_table_token) < 20 or char_length(p_table_token) > 200 then
    raise exception 'invalid_table_token' using errcode = '22023';
  end if;

  select
    t.id,
    t.restaurant_id,
    t.table_number,
    t.status as table_status,
    t.qr_token_expires_at,
    r.name as restaurant_name,
    r.currency,
    r.timezone,
    r.status as restaurant_status
  into v_table
  from public.dining_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.qr_token_hash = encode(sha256(convert_to(p_table_token, 'utf8')), 'hex');

  if not found then
    raise exception 'invalid_table_token' using errcode = '22023';
  end if;
  if v_table.table_status <> 'active' then
    raise exception 'table_unavailable';
  end if;
  if v_table.qr_token_expires_at is not null and v_table.qr_token_expires_at < now() then
    raise exception 'table_unavailable';
  end if;
  if v_table.restaurant_status <> 'active' then
    raise exception 'restaurant_unavailable';
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', v_table.restaurant_name,
      'currency', v_table.currency,
      'timezone', v_table.timezone
    ),
    'table', jsonb_build_object('number', v_table.table_number),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', mi.id,
                'name', mi.name,
                'description', mi.description,
                'price_minor', mi.price_minor,
                'is_available', mi.is_available,
                'image_url', mi.image_url
              )
              order by mi.sort_order, mi.name
            )
            from public.menu_items mi
            where mi.category_id = c.id
          ), '[]'::jsonb)
        )
        order by c.sort_order, c.name
      )
      from public.categories c
      where c.restaurant_id = v_table.restaurant_id
        and c.is_active
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Place an order from a QR/tablet session.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_table_token text,
  p_items jsonb,
  p_idempotency_key text,
  p_source text default 'qr',
  p_customer_note text default null
)
returns table (
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
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  if char_length(v_key) < 8 or char_length(v_key) > 200 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if p_table_token is null or char_length(p_table_token) < 20 or char_length(p_table_token) > 200 then
    raise exception 'invalid_table_token' using errcode = '22023';
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
    raise exception 'invalid_table_token' using errcode = '22023';
  end if;
  if v_table.table_status <> 'active' then
    raise exception 'table_unavailable';
  end if;
  if v_table.qr_token_expires_at is not null and v_table.qr_token_expires_at < now() then
    raise exception 'table_unavailable';
  end if;
  if v_table.restaurant_status <> 'active' then
    raise exception 'restaurant_unavailable';
  end if;

  -- A repeated submit (double click, retry, lost response) returns the order
  -- that already exists instead of creating a second one.
  select * into v_existing
  from public.orders o
  where o.restaurant_id = v_table.restaurant_id
    and o.idempotency_key = v_key;

  if found then
    return query
      select v_existing.id, v_existing.order_number, v_existing.public_token,
             v_existing.subtotal_minor, v_existing.total_minor,
             v_existing.status, v_existing.created_at;
    return;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select count(*) into v_line_count from jsonb_array_elements(p_items);
  if v_line_count < 1 or v_line_count > 50 then
    raise exception 'invalid_items' using errcode = '22023';
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
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select mi.name into v_unavailable
  from jsonb_array_elements(p_items) as e
  join public.menu_items mi on mi.id = (e ->> 'menu_item_id')::uuid
  where mi.restaurant_id = v_table.restaurant_id
    and mi.is_available = false
  limit 1;

  if v_unavailable is not null then
    raise exception 'item_unavailable: %', v_unavailable using errcode = '22023';
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
    raise exception 'invalid_menu_item' using errcode = '22023';
  end if;

  -- Totals always come from the trusted menu price, never from the browser.
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
  on conflict (restaurant_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning * into v_order;

  -- Lost a race with a concurrent request carrying the same key: return the
  -- winner's order instead of failing the diner's request.
  if v_order.id is null then
    select * into v_order
    from public.orders o
    where o.restaurant_id = v_table.restaurant_id
      and o.idempotency_key = v_key;

    if v_order.id is null then
      raise exception 'order_conflict' using errcode = '40001';
    end if;

    return query
      select v_order.id, v_order.order_number, v_order.public_token,
             v_order.subtotal_minor, v_order.total_minor,
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
    select v_order.id, v_order.order_number, v_order.public_token,
           v_order.subtotal_minor, v_order.total_minor,
           v_order.status, v_order.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public order status for the diner's status/bill page.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_order(p_public_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  if p_public_token is null
     or p_public_token !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid_order_token' using errcode = '22023';
  end if;

  select
    o.id,
    o.order_number,
    o.status,
    o.currency,
    o.subtotal_minor,
    o.charges_minor,
    o.total_minor,
    o.customer_note,
    o.created_at,
    o.updated_at,
    t.table_number,
    r.name as restaurant_name
  into v_order
  from public.orders o
  join public.dining_tables t on t.id = o.table_id
  join public.restaurants r on r.id = o.restaurant_id
  where o.public_token = p_public_token;

  if not found then
    raise exception 'order_not_found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status,
    'currency', v_order.currency,
    'subtotal_minor', v_order.subtotal_minor,
    'charges_minor', v_order.charges_minor,
    'total_minor', v_order.total_minor,
    'customer_note', v_order.customer_note,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'table_number', v_order.table_number,
    'restaurant_name', v_order.restaurant_name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', oi.item_name_snapshot,
          'quantity', oi.quantity,
          'unit_price_minor', oi.unit_price_minor,
          'line_total_minor', oi.line_total_minor,
          'notes', oi.notes
        )
        order by oi.created_at, oi.id
      )
      from public.order_items oi
      where oi.order_id = v_order.id
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object('status', e.to_status, 'at', e.created_at)
        order by e.created_at, e.id
      )
      from public.order_status_events e
      where e.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Validated staff status transition.
-- ---------------------------------------------------------------------------
create or replace function public.update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_reason text default null
)
returns table (order_id uuid, previous_status text, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_previous_status text;
  v_role text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_allowed boolean := false;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  v_role := public.current_member_role(v_order.restaurant_id);
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The full transition matrix; roles are the permitted actors for each edge.
  v_allowed := case
    when v_order.status = 'pending' and p_to_status = 'accepted'
      then v_role in ('owner', 'manager', 'wait_staff')
    when v_order.status = 'pending' and p_to_status = 'cancelled'
      then v_role in ('owner', 'manager', 'wait_staff')
    when v_order.status = 'accepted' and p_to_status = 'preparing'
      then v_role in ('owner', 'manager', 'wait_staff', 'kitchen')
    when v_order.status = 'accepted' and p_to_status = 'cancelled'
      then v_role in ('owner', 'manager')
    when v_order.status = 'preparing' and p_to_status = 'ready'
      then v_role in ('owner', 'manager', 'wait_staff', 'kitchen')
    when v_order.status = 'preparing' and p_to_status = 'cancelled'
      then v_role in ('owner', 'manager')
    when v_order.status = 'ready' and p_to_status = 'served'
      then v_role in ('owner', 'manager', 'wait_staff')
    when v_order.status = 'ready' and p_to_status = 'cancelled'
      then v_role in ('owner', 'manager')
    when v_order.status = 'served' and p_to_status = 'completed'
      then v_role in ('owner', 'manager', 'wait_staff')
    else false
  end;

  if not v_allowed then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;

  if p_to_status = 'cancelled' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  v_previous_status := v_order.status;

  update public.orders
  set
    status = p_to_status,
    accepted_at = case when p_to_status = 'accepted' then now() else accepted_at end,
    ready_at = case when p_to_status = 'ready' then now() else ready_at end,
    served_at = case when p_to_status = 'served' then now() else served_at end,
    completed_at = case when p_to_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_to_status = 'cancelled' then now() else cancelled_at end
  where id = v_order.id
  returning * into v_order;

  insert into public.order_status_events (
    restaurant_id, order_id, from_status, to_status, actor_id, reason
  )
  values (
    v_order.restaurant_id, v_order.id, v_previous_status, p_to_status, v_actor, v_reason
  );

  insert into public.audit_logs (restaurant_id, actor_id, action, entity_type, entity_id, metadata_redacted)
  values (
    v_order.restaurant_id, v_actor, 'order.status_changed', 'order', v_order.id,
    jsonb_build_object('from', v_previous_status, 'to', p_to_status)
  );

  return query select v_order.id, v_previous_status, p_to_status, v_order.updated_at;
end;
$$;

revoke all on function public.get_table_context(text) from public;
revoke all on function public.place_order(text, jsonb, text, text, text) from public;
revoke all on function public.get_public_order(text) from public;
revoke all on function public.update_order_status(uuid, text, text) from public;

grant execute on function public.get_table_context(text) to anon, authenticated, service_role;
grant execute on function public.place_order(text, jsonb, text, text, text) to anon, authenticated, service_role;
grant execute on function public.get_public_order(text) to anon, authenticated, service_role;
grant execute on function public.update_order_status(uuid, text, text) to authenticated, service_role;
