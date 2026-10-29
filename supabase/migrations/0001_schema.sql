-- TableFlow baseline schema.
--
-- Targets PostgreSQL 15+ as provided by Supabase. Money is stored in integer
-- minor units (KES cents). Every tenant-owned row carries restaurant_id so RLS
-- can enforce restaurant isolation without following relationships at query time.

create sequence public.order_number_seq;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'setup' check (status in ('active', 'suspended', 'setup')),
  currency char(3) not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  -- Owner decision (2026-10-21): staff acceptance is required. Kept as a column
  -- so a later stage can make it configurable without a schema change.
  requires_order_acceptance boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'wait_staff', 'kitchen', 'cashier')),
  status text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_members_unique_membership unique (restaurant_id, user_id)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_number text not null check (char_length(btrim(table_number)) between 1 and 40),
  -- Only the SHA-256 hash of the QR token is stored. The raw token is shown once
  -- when generated and is never recoverable from the database.
  qr_token_hash text not null unique check (qr_token_hash ~ '^[0-9a-f]{64}$'),
  qr_token_expires_at timestamptz,
  qr_token_rotated_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dining_tables_unique_number unique (restaurant_id, table_number),
  constraint dining_tables_tenant_identity unique (id, restaurant_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_tenant_identity unique (id, restaurant_id)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  image_url text,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'KES',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Guarantees an item can never be attached to another restaurant's category.
  constraint menu_items_category_same_restaurant
    foreign key (category_id, restaurant_id)
    references public.categories (id, restaurant_id)
    on delete set null (category_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  table_id uuid not null,
  order_number text not null,
  -- Opaque token used by the diner's status page. No customer account required.
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  source text not null check (source in ('qr', 'tablet', 'staff')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  currency char(3) not null default 'KES',
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  charges_minor bigint not null default 0 check (charges_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 200),
  customer_note text check (customer_note is null or char_length(customer_note) <= 500),
  accepted_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_number_unique unique (restaurant_id, order_number),
  constraint orders_tenant_identity unique (id, restaurant_id),
  constraint orders_total_matches_parts check (total_minor = subtotal_minor + charges_minor),
  constraint orders_table_same_restaurant
    foreign key (table_id, restaurant_id)
    references public.dining_tables (id, restaurant_id)
    on delete restrict
);

create unique index orders_idempotency_unique
  on public.orders (restaurant_id, idempotency_key)
  where idempotency_key is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name_snapshot text not null,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_minor bigint not null check (line_total_minor >= 0),
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  constraint order_items_line_total check (line_total_minor = unit_price_minor * quantity)
);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  constraint order_status_events_order_same_restaurant
    foreign key (order_id, restaurant_id)
    references public.orders (id, restaurant_id)
    on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  method text not null check (method in ('mpesa', 'cash', 'card', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'unknown', 'refunded')),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'KES',
  provider_request_id text,
  provider_transaction_ref text,
  recorded_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_order_same_restaurant
    foreign key (order_id, restaurant_id)
    references public.orders (id, restaurant_id)
    on delete restrict
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id) on delete cascade,
  provider text not null,
  event_reference text not null unique,
  event_type text not null,
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payload_redacted jsonb,
  received_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata_redacted jsonb,
  created_at timestamptz not null default now()
);

create index orders_restaurant_status_created_idx
  on public.orders (restaurant_id, status, created_at desc);
create index orders_restaurant_table_created_idx
  on public.orders (restaurant_id, table_id, created_at desc);
create index order_items_order_idx on public.order_items (order_id);
create index order_status_events_order_idx on public.order_status_events (order_id, created_at);
create index payments_restaurant_order_status_idx
  on public.payments (restaurant_id, order_id, status);
create index restaurant_members_user_status_idx
  on public.restaurant_members (user_id, status);
create index menu_items_restaurant_available_idx
  on public.menu_items (restaurant_id, is_available, sort_order);
create index categories_restaurant_active_idx
  on public.categories (restaurant_id, is_active, sort_order);
create index audit_logs_restaurant_created_idx
  on public.audit_logs (restaurant_id, created_at desc);

-- Keep updated_at honest without relying on application code.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'restaurants', 'profiles', 'restaurant_members', 'dining_tables',
    'categories', 'menu_items', 'orders', 'payments'
  ]
  loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()',
      target, target
    );
  end loop;
end
$$;

-- Create a profile row whenever an auth user is created (Supabase Auth and the
-- local development shim both insert into auth.users). Supabase exposes
-- raw_user_meta_data; the local shim does not, so pick the variant that fits.
do $$
declare
  has_metadata boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data'
  ) into has_metadata;

  if has_metadata then
    execute $fn$
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      begin
        insert into public.profiles (id, display_name)
        values (
          new.id,
          coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
        )
        on conflict (id) do nothing;
        return new;
      end;
      $body$;
    $fn$;
  else
    execute $fn$
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      begin
        insert into public.profiles (id, display_name)
        values (new.id, split_part(new.email, '@', 1))
        on conflict (id) do nothing;
        return new;
      end;
      $body$;
    $fn$;
  end if;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
end
$$;
