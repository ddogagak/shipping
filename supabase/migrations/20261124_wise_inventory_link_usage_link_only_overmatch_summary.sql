CREATE OR REPLACE FUNCTION public.wise_inventory_link_usage()
RETURNS TABLE(target_type text,target_id uuid,capacity bigint,linked bigint)
LANGUAGE sql STABLE
SET search_path TO ''
AS $fn$
  WITH direct AS (
    SELECT l.purchase_item_id id,sum(l.quantity)::bigint units
    FROM public.wise_sale_inventory_links l WHERE l.purchase_item_id IS NOT NULL GROUP BY l.purchase_item_id
  ), boxuse AS (
    SELECT b.id,
      coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
           WHERE l.random_box_id=b.id),0)
      +coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
          JOIN public.sale_random_box_members m ON m.purchase_item_id=l.purchase_item_id
          WHERE m.random_box_id=b.id),0) AS units
    FROM public.sale_random_boxes b
  ), groupuse AS (
    SELECT g.id,
      coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
           WHERE l.inventory_group_id=g.id),0)
      +coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
          JOIN public.sale_inventory_group_members m ON m.purchase_item_id=l.purchase_item_id
          WHERE m.group_id=g.id),0) AS units
    FROM public.sale_inventory_groups g WHERE g.active
  )
  SELECT 'purchase_item'::text,p.id,public.wise_link_inventory_capacity('purchase_item',p.id),
      coalesce(d.units,0) FROM public.purchase_items p LEFT JOIN direct d ON d.id=p.id
  UNION ALL
  SELECT 'random_box',b.id,public.wise_link_inventory_capacity('random_box',b.id),bu.units
  FROM public.sale_random_boxes b JOIN boxuse bu ON bu.id=b.id
  UNION ALL
  SELECT 'inventory_group',g.id,public.wise_link_inventory_capacity('inventory_group',g.id),gu.units
  FROM public.sale_inventory_groups g JOIN groupuse gu ON gu.id=g.id;
$fn$;
REVOKE ALL ON FUNCTION public.wise_inventory_link_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wise_inventory_link_usage() TO service_role;