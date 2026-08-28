alter table public.inventory_items
  add column if not exists internal_sku text,
  add column if not exists source_site_code text,
  add column if not exists source_product_id text,
  add column if not exists option_seq integer;

create unique index if not exists inventory_items_internal_sku_uidx
  on public.inventory_items(internal_sku)
  where internal_sku is not null;

alter table public.purchase_items
  add column if not exists internal_sku text;

create index if not exists purchase_items_internal_sku_idx
  on public.purchase_items(internal_sku)
  where internal_sku is not null;
