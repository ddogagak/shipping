alter table public.purchase_sale_inventory
  add column if not exists public_comment text;
