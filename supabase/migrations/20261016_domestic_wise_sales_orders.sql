-- Wise order sales snapshot for monthly/quarterly sales reporting.
create table if not exists public.domestic_wise_sales_order (
  wise_order_id bigint primary key,
  buyer_nickname text not null default '',
  ordered_at timestamptz not null,
  wise_status integer,
  item_names text[] not null default '{}',
  total_amount numeric not null default 0,
  item_count integer not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);
create index if not exists domestic_wise_sales_order_ordered_at_idx
  on public.domestic_wise_sales_order (ordered_at desc);
alter table public.domestic_wise_sales_order enable row level security;

-- Backfill the orders already cached for Wise item cards.
insert into public.domestic_wise_sales_order
  (wise_order_id, buyer_nickname, ordered_at, item_names, total_amount, item_count, imported_at)
select
  wise_order_id,
  max(buyer_nickname),
  min(ordered_at),
  array_agg(item_name order by item_name),
  sum(item_price),
  count(*)::integer,
  now()
from public.domestic_wise_item_photo
group by wise_order_id
on conflict (wise_order_id) do nothing;
