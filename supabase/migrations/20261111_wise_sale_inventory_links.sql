-- Post-sale inventory matching is independent of Wise sales, shipping and stock totals.
-- Never deduct stock or modify purchase-sale inventory in this mapping migration.
create table if not exists public.wise_sale_inventory_links (
  wise_stock_id bigint primary key
    references public.domestic_wise_item_photo(wise_stock_id) on delete cascade,
  purchase_item_id uuid
    references public.purchase_items(id) on delete cascade,
  random_box_id uuid
    references public.sale_random_boxes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wise_sale_inventory_links_exactly_one_target
    check ((purchase_item_id is not null) <> (random_box_id is not null))
);

create index if not exists idx_wise_sale_inventory_links_purchase_item
  on public.wise_sale_inventory_links(purchase_item_id)
  where purchase_item_id is not null;
create index if not exists idx_wise_sale_inventory_links_random_box
  on public.wise_sale_inventory_links(random_box_id)
  where random_box_id is not null;

alter table public.wise_sale_inventory_links enable row level security;
-- No client policies: the server-side API uses the service role, never the browser.
comment on table public.wise_sale_inventory_links is
  'Optional manual links from individual Wise actual-sale rows to broadcast-sale inventory. Does not update inventory quantities, revenue or shipping.';
