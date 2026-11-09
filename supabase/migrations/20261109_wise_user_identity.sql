alter table public.domestic_order add column if not exists wise_user_id text;
alter table public.domestic_wise_order_link add column if not exists wise_user_id text;
alter table public.domestic_wise_import_queue add column if not exists wise_user_id text;
alter table public.domestic_wise_sales_order add column if not exists wise_user_id text;
alter table public.domestic_wise_item_photo add column if not exists wise_user_id text;
alter table public.domestic_wise_order_snapshot add column if not exists wise_user_id text;

create index if not exists domestic_order_wise_user_id_idx
  on public.domestic_order (wise_user_id)
  where wise_user_id is not null;

create index if not exists domestic_wise_order_link_user_id_idx
  on public.domestic_wise_order_link (wise_user_id)
  where wise_user_id is not null;

create index if not exists domestic_wise_import_queue_user_id_idx
  on public.domestic_wise_import_queue (wise_user_id)
  where wise_user_id is not null;

create index if not exists domestic_wise_sales_order_user_id_idx
  on public.domestic_wise_sales_order (wise_user_id)
  where wise_user_id is not null;

create index if not exists domestic_wise_item_photo_user_id_idx
  on public.domestic_wise_item_photo (wise_user_id)
  where wise_user_id is not null;

create index if not exists domestic_wise_order_snapshot_user_id_idx
  on public.domestic_wise_order_snapshot (wise_user_id)
  where wise_user_id is not null;
