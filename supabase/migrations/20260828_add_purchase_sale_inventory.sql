create table if not exists public.purchase_sale_inventory (
  purchase_item_id uuid primary key references public.purchase_items(id) on delete cascade,
  sale_price numeric(12,2),
  remaining_quantity integer not null default 0,
  sold_quantity integer not null default 0,
  stock_status text not null default 'active' check (stock_status in ('active','soldout')),
  sale_memo text,
  sold_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_sale_inventory_status
  on public.purchase_sale_inventory(stock_status);

create or replace function public.set_purchase_sale_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_purchase_sale_inventory_updated_at on public.purchase_sale_inventory;
create trigger trg_purchase_sale_inventory_updated_at
before update on public.purchase_sale_inventory
for each row execute function public.set_purchase_sale_inventory_updated_at();
