-- Keep broadcast-sale titles independent from purchase item and sourcing titles.
ALTER TABLE public.purchase_sale_inventory
  ADD COLUMN IF NOT EXISTS display_name text;

-- Preserve existing manually edited broadcast titles at migration time.
-- Existing purchase display_name_ko values may be user edits; do not overwrite them.
UPDATE public.purchase_sale_inventory AS ledger
SET display_name = COALESCE(NULLIF(BTRIM(pi.display_name_ko), ''), NULLIF(BTRIM(pi.product_name), ''))
FROM public.purchase_items AS pi
WHERE ledger.purchase_item_id = pi.id
  AND ledger.display_name IS NULL
  AND NULLIF(BTRIM(pi.display_name_ko), '') IS NOT NULL;
