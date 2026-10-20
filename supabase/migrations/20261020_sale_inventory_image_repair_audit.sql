-- Keep a durable per-item snapshot before any SKU image correction.
create table if not exists public.sale_inventory_image_repair_audit (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid not null references public.purchase_items(id) on delete cascade,
  internal_sku text not null,
  previous_image_url text,
  restored_image_url text not null,
  original_sourcing_inventory_id uuid,
  restored_sourcing_inventory_id uuid,
  repaired_at timestamptz not null default now()
);
create index if not exists sale_inventory_image_repair_audit_item_idx
  on public.sale_inventory_image_repair_audit(purchase_item_id, repaired_at desc);
