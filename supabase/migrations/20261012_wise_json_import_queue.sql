-- WYYYES JSON import staging; does not mutate domestic_order/domestic_shipping.
create table if not exists public.domestic_wise_import_queue (
 wise_order_id bigint primary key,
 buyer_nickname text not null,
 ordered_at timestamptz not null,
 receiver_name text,
 receiver_phone text,
 postal_code text,
 address text,
 item_summary text,
 item_total_price numeric not null default 0,
 item_count integer not null default 0,
 review_status text not null default 'pending' check(review_status in ('pending','reviewed','ignored')),
 imported_at timestamptz not null default now()
);
create index if not exists domestic_wise_import_queue_status_idx on public.domestic_wise_import_queue(review_status,ordered_at desc);
alter table public.domestic_wise_import_queue enable row level security;
-- Required snapshot tables from unified import SQL must already exist.
