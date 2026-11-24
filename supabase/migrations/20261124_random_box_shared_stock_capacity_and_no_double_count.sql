CREATE OR REPLACE FUNCTION public.wise_random_box_shared_stock()
RETURNS TABLE(random_box_id uuid,capacity bigint,box_matched bigint,member_matched bigint,total_matched bigint,remaining_units bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $fn$
 SELECT b.id,
  coalesce(b.stock_capacity_units,greatest(0,b.purchase_quantity)::bigint*greatest(1,b.component_count)::bigint),
  coalesce(s.used,0),coalesce(ms.used,0),
  coalesce(s.used,0)+coalesce(ms.used,0),
  CASE WHEN b.view_status='completed' THEN 0
  ELSE greatest(0,coalesce(b.remaining_units,coalesce(b.stock_capacity_units,greatest(0,b.purchase_quantity)::bigint*greatest(1,b.component_count)::bigint))
       -greatest(0,coalesce(s.used,0)+coalesce(ms.used,0)-coalesce(s.applied,0)-coalesce(ms.applied,0)))
  END
 FROM public.sale_random_boxes b
 LEFT JOIN LATERAL (
  SELECT sum(l.quantity)::bigint used,sum(l.applied_units)::bigint applied
  FROM public.wise_sale_inventory_links l WHERE l.random_box_id=b.id
 ) s ON true
 LEFT JOIN LATERAL (
  SELECT sum(l.quantity)::bigint used,sum(l.applied_units)::bigint applied
  FROM public.wise_sale_inventory_links l JOIN public.sale_random_box_members m ON m.purchase_item_id=l.purchase_item_id
  WHERE m.random_box_id=b.id
 ) ms ON true;
$fn$;
