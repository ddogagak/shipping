-- Supabase/Postgres schema for future order-management expansion
-- Scope of this revision: DB design only (no runtime integration code).

create extension if not exists pgcrypto;

-- =========================
-- orders: eBay order unit
-- =========================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  -- eBay order key (dedupe guard)
  order_no text not null unique,

  order_date timestamptz,
  sales_record_no text,

  buyer_username text,
  buyer_email text,
  phone text,

  recipient_name text,
  address1 text,
  city text,
  state text,
  postal_code text,
  country text,
  country_code text,

  -- normalized key for combined-shipping detection / reverse tracking matching
  address_key text,

  tax_code text,
  shipping_service text,

  subtotal numeric(12,2),
  shipping_fee numeric(12,2),
  tax_amount numeric(12,2),
  refund_amount numeric(12,2),
  order_total numeric(12,2),

  export_price numeric(12,2),
  total_quantity integer,

  -- Order workflow status (business process)
  process_status text not null default 'pending'
    check (process_status in ('ready','pending','refund','contact','cancelled','completed')),

  -- Shipping lifecycle status (carrier/export progress)
  shipping_status text not null default 'not_exported'
    check (shipping_status in ('not_exported','exported','reserved','accepted','tracking_added','shipped','issue')),

  memo text,
  raw_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_process_status on public.orders(process_status);
create index if not exists idx_orders_shipping_status on public.orders(shipping_status);
create index if not exists idx_orders_country_code on public.orders(country_code);
create index if not exists idx_orders_address_key on public.orders(address_key);

-- =================================
-- order_items: line items per order
-- =================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  item_id text,
  title text,
  option_text text,

  quantity integer not null default 1,
  item_price numeric(12,2),
  item_total numeric(12,2),

  content_type text,
  hscode text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- ===========================================
-- shipments: physical/exported shipment record
-- ===========================================
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),

  -- default carrier now: korea_post, but text for future multi-carrier support
  carrier text not null default 'korea_post',

  service_code text,
  shipment_status text not null default 'reserved'
    check (shipment_status in ('reserved','accepted','tracking_added','shipped','issue')),

  tracking_number text,

  recipient_name text,
  country_code text,

  reserved_at timestamptz,
  accepted_at timestamptz,
  shipped_at timestamptz,

  external_payload jsonb,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipments_tracking_number on public.shipments(tracking_number);
create index if not exists idx_shipments_status on public.shipments(shipment_status);

-- =====================================================
-- shipment_orders: N:M map for combined shipping support
-- =====================================================
create table if not exists public.shipment_orders (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,

  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  unique (shipment_id, order_id)
);

create index if not exists idx_shipment_orders_shipment_id on public.shipment_orders(shipment_id);
create index if not exists idx_shipment_orders_order_id on public.shipment_orders(order_id);

-- Optional helper: a single primary order per shipment
create unique index if not exists ux_shipment_orders_primary
  on public.shipment_orders(shipment_id)
  where is_primary = true;

-- ============================
-- updated_at maintenance trigger
-- ============================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_set_updated_at on public.orders;
create trigger trg_orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_order_items_set_updated_at on public.order_items;
create trigger trg_order_items_set_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_shipments_set_updated_at on public.shipments;
create trigger trg_shipments_set_updated_at
before update on public.shipments
for each row execute function public.set_updated_at();
