-- Optional Wise item-photo cache. No changes to domestic_order or shipping statuses.
create table if not exists public.domestic_wise_item_photo (
  wise_stock_id bigint primary key,
  wise_order_id bigint not null,
  buyer_nickname text not null,
  ordered_at timestamptz not null,
  item_name text not null,
  item_price numeric not null default 0,
  image_url text,
  imported_at timestamptz not null default now()
);
create index if not exists domestic_wise_item_photo_nickname_idx on public.domestic_wise_item_photo (buyer_nickname);
alter table public.domestic_wise_item_photo enable row level security;
-- Accessed exclusively through the existing server-side service role client.
