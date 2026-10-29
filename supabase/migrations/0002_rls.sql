-- Row Level Security, membership helpers, staff read views, and grants.
--
-- Local development recreates the Supabase roles (anon, authenticated,
-- service_role) in scripts/dev-db/bootstrap.sql, so these policies are the same
-- ones exercised in tests and in production.

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policies can consult restaurant_members without
-- recursing into restaurant_members' own RLS policy.
create or replace function public.current_member_role(p_restaurant_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.restaurant_members m
  where m.restaurant_id = p_restaurant_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1
$$;

create or replace function public.is_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_member_role(p_restaurant_id) is not null
$$;

-- Roles are passed as a text array, e.g. array['owner','manager'].
create or replace function public.has_role(p_restaurant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_member_role(p_restaurant_id) = any (p_roles), false)
$$;

revoke all on function public.current_member_role(uuid) from public;
revoke all on function public.is_member(uuid) from public;
revoke all on function public.has_role(uuid, text[]) from public;
grant execute on function public.current_member_role(uuid) to authenticated, service_role;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.dining_tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.audit_logs enable row level security;

-- restaurants: members read their own; owner/manager may edit settings.
create policy restaurants_select_members on public.restaurants
  for select to authenticated
  using (public.is_member(id));

create policy restaurants_update_managers on public.restaurants
  for update to authenticated
  using (public.has_role(id, array['owner', 'manager']))
  with check (public.has_role(id, array['owner', 'manager']));

-- profiles: users read/update themselves and see staff they share a
-- restaurant with (needed for staff lists and order timelines).
create policy profiles_select_self_or_colleagues on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.restaurant_members mine
      join public.restaurant_members theirs
        on theirs.restaurant_id = mine.restaurant_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = profiles.id
        and theirs.status = 'active'
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- restaurant_members: a user sees their own membership; owners/managers see all
-- memberships of their restaurant.
create policy restaurant_members_select on public.restaurant_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(restaurant_id, array['owner', 'manager'])
  );

create policy restaurant_members_insert on public.restaurant_members
  for insert to authenticated
  with check (
    public.has_role(restaurant_id, array['owner'])
    or (
      public.has_role(restaurant_id, array['manager'])
      and role <> 'owner'
    )
  );

create policy restaurant_members_update on public.restaurant_members
  for update to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']))
  with check (
    public.has_role(restaurant_id, array['owner'])
    or (
      public.has_role(restaurant_id, array['manager'])
      and role <> 'owner'
    )
  );

create policy restaurant_members_delete on public.restaurant_members
  for delete to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']));

-- dining_tables: all active staff can read table numbers; managers maintain.
create policy dining_tables_select_members on public.dining_tables
  for select to authenticated
  using (public.is_member(restaurant_id));

create policy dining_tables_insert_managers on public.dining_tables
  for insert to authenticated
  with check (public.has_role(restaurant_id, array['owner', 'manager']));

create policy dining_tables_update_managers on public.dining_tables
  for update to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']))
  with check (public.has_role(restaurant_id, array['owner', 'manager']));

create policy dining_tables_delete_managers on public.dining_tables
  for delete to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']));

-- categories / menu_items: kitchen is excluded from the menu because it
-- contains prices (owner decision, 2026-10-21).
create policy categories_select_priced_roles on public.categories
  for select to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'wait_staff']));

create policy categories_write_managers on public.categories
  for all to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']))
  with check (public.has_role(restaurant_id, array['owner', 'manager']));

create policy menu_items_select_priced_roles on public.menu_items
  for select to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'wait_staff']));

create policy menu_items_write_managers on public.menu_items
  for all to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager']))
  with check (public.has_role(restaurant_id, array['owner', 'manager']));

-- Base order tables: RLS is enabled as defence in depth, but authenticated
-- users are not granted direct access. Reads go through the masked staff views
-- below and writes through validated functions (0003_functions.sql).
create policy orders_select_members on public.orders
  for select to authenticated
  using (public.is_member(restaurant_id));

create policy order_items_select_members on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_member(o.restaurant_id)
    )
  );

create policy order_status_events_select_members on public.order_status_events
  for select to authenticated
  using (public.is_member(restaurant_id));

-- payments: finance-facing roles only. Payment writes are server-only (Stage 5).
create policy payments_select_finance_roles on public.payments
  for select to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'cashier']));

create policy audit_logs_select_managers on public.audit_logs
  for select to authenticated
  using (restaurant_id is not null and public.has_role(restaurant_id, array['owner', 'manager']));

-- payment_events intentionally has RLS enabled and no policies: only the
-- service role (callback processing) may touch it.

-- ---------------------------------------------------------------------------
-- Staff read views
-- ---------------------------------------------------------------------------
-- Prices and totals are masked for kitchen staff. The views carry the
-- membership filter themselves because they are owned by the migration role and
-- therefore do not inherit the caller's RLS.
create view public.staff_orders
with (security_barrier = true)
as
select
  o.id,
  o.restaurant_id,
  o.order_number,
  o.table_id,
  t.table_number,
  o.status,
  o.source,
  o.customer_note,
  case when public.current_member_role(o.restaurant_id) = 'kitchen' then null
       else o.subtotal_minor end as subtotal_minor,
  case when public.current_member_role(o.restaurant_id) = 'kitchen' then null
       else o.charges_minor end as charges_minor,
  case when public.current_member_role(o.restaurant_id) = 'kitchen' then null
       else o.total_minor end as total_minor,
  o.created_at,
  o.updated_at,
  o.accepted_at,
  o.ready_at,
  o.served_at,
  o.completed_at,
  o.cancelled_at
from public.orders o
join public.dining_tables t
  on t.id = o.table_id
 and t.restaurant_id = o.restaurant_id
where public.is_member(o.restaurant_id);

create view public.staff_order_items
with (security_barrier = true)
as
select
  oi.id,
  oi.order_id,
  o.restaurant_id,
  oi.menu_item_id,
  oi.item_name_snapshot,
  oi.quantity,
  oi.notes,
  case when public.current_member_role(o.restaurant_id) = 'kitchen' then null
       else oi.unit_price_minor end as unit_price_minor,
  case when public.current_member_role(o.restaurant_id) = 'kitchen' then null
       else oi.line_total_minor end as line_total_minor,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where public.is_member(o.restaurant_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.restaurants, public.profiles, public.restaurant_members,
  public.dining_tables, public.categories, public.menu_items,
  public.order_status_events, public.audit_logs
  to authenticated;

grant insert, update, delete on public.restaurant_members, public.dining_tables,
  public.categories, public.menu_items
  to authenticated;

grant select on public.staff_orders, public.staff_order_items to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
