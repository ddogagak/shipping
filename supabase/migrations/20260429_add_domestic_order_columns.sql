alter table public.orders
  add column if not exists order_type text default 'domestic',
  add column if not exists workflow_status text default 'order_input',
  add column if not exists platform text,
  add column if not exists platform_order_no text,
  add column if not exists customer_nickname text,
  add column if not exists item_summary text,
  add column if not exists item_count integer default 0,
  add column if not exists domestic_memo text,
  add column if not exists carrier text,
  add column if not exists tracking_number text;

alter table public.orders
  drop constraint if exists orders_workflow_status_check;

alter table public.orders
  add constraint orders_workflow_status_check
  check (workflow_status in ('order_input','address_input','tracking_input','delivered'));

alter table public.orders
  drop constraint if exists orders_platform_check;

alter table public.orders
  add constraint orders_platform_check
  check (platform in ('wise','bunjang','x','ebay') or platform is null);

create index if not exists idx_orders_order_type on public.orders(order_type);
create index if not exists idx_orders_workflow_status on public.orders(workflow_status);
create index if not exists idx_orders_platform on public.orders(platform);
