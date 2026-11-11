-- Preserve all existing manual links while allowing multiple inventory targets per Wise sale.
-- No stock deduction, revenue update, purchase update, or shipping update.
alter table public.wise_sale_inventory_links
  add column if not exists id bigserial,
  add column if not exists quantity integer not null default 1;

alter table public.wise_sale_inventory_links
  drop constraint if exists wise_sale_inventory_links_pkey;
alter table public.wise_sale_inventory_links
  add constraint wise_sale_inventory_links_pkey primary key (id);

alter table public.wise_sale_inventory_links
  add constraint wise_sale_inventory_links_quantity_valid
  check (quantity between 1 and 9999);

-- Nulls are distinct, so each pair uniquely identifies its corresponding target type.
create unique index if not exists wise_sale_inventory_links_sale_purchase_uq
  on public.wise_sale_inventory_links (wise_stock_id, purchase_item_id);
create unique index if not exists wise_sale_inventory_links_sale_box_uq
  on public.wise_sale_inventory_links (wise_stock_id, random_box_id);
create index if not exists wise_sale_inventory_links_sale_idx
  on public.wise_sale_inventory_links (wise_stock_id);

alter table public.wise_sale_inventory_links enable row level security;
comment on table public.wise_sale_inventory_links is
  'Manual many-to-many links from Wise actual sales to broadcast inventory, with per-target quantity; no automatic stock or revenue effects.';
