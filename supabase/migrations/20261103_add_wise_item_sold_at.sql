-- Preserve the original Wise order timestamp and store the actual per-item sale timestamp.
-- Existing rows remain null until the Wise order history is synchronized again.
alter table public.domestic_wise_item_photo
  add column if not exists sold_at timestamptz;

create index if not exists domestic_wise_item_photo_sold_at_idx
  on public.domestic_wise_item_photo (sold_at);
