CREATE OR REPLACE FUNCTION public.wise_apply_inventory_units_clamped(p_type text, p_id uuid, p_delta integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_target uuid;
 v_capacity bigint;
 v_remain bigint;
 v_component integer;
 v_boxes bigint;
 v_status text;
 v_take integer;
BEGIN
 IF p_delta=0 THEN RETURN 0; END IF;
 IF p_delta<0 THEN
   PERFORM public.wise_adjust_inventory_units(p_type,p_id,p_delta);
   RETURN p_delta;
 END IF;
 IF p_type='purchase_item' THEN
   SELECT random_box_id INTO v_target FROM public.sale_random_box_members
    WHERE purchase_item_id=p_id LIMIT 1;
   IF v_target IS NOT NULL THEN
     RETURN public.wise_apply_inventory_units_clamped('random_box',v_target,p_delta);
   END IF;
   SELECT public.wise_link_inventory_capacity('purchase_item',i.id),
     CASE WHEN l.stock_status='soldout' THEN 0
     ELSE coalesce(l.remaining_units,
       l.remaining_quantity::bigint*greatest(1,coalesce(
         nullif(l.component_count_override,0),nullif(i.component_count,0),
         nullif(meta.n,0),nullif(src.component_count,0),1)),
       public.wise_link_inventory_capacity('purchase_item',i.id))
     END
     INTO v_capacity,v_remain
   FROM public.purchase_items i
   JOIN public.purchase_orders o ON o.id=i.purchase_order_id
   LEFT JOIN public.purchase_sale_inventory l ON l.purchase_item_id=i.id
   LEFT JOIN public.inventory_items src ON src.id=i.sourcing_inventory_id
   LEFT JOIN LATERAL (
     SELECT CASE WHEN x->>'component_count' ~ '^[0-9]{1,6}$'
       THEN (x->>'component_count')::integer END n
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.raw_data->'domestic_items')='array'
       THEN o.raw_data->'domestic_items' ELSE '[]'::jsonb END) x
     WHERE coalesce(x->>'product_name','')=coalesce(i.product_name,'')
       AND coalesce(x->>'option_text','')=coalesce(i.option_text,'')
     LIMIT 1
   ) meta ON true
   WHERE i.id=p_id;
 ELSIF p_type='random_box' THEN
   SELECT public.wise_link_inventory_capacity('random_box',b.id),
      CASE WHEN b.view_status='completed' THEN 0
       ELSE coalesce(b.remaining_units,public.wise_link_inventory_capacity('random_box',b.id))
      END
     INTO v_capacity,v_remain
   FROM public.sale_random_boxes b WHERE b.id=p_id;
 ELSE
   RAISE EXCEPTION '지원하지 않는 재고 유형: %',p_type;
 END IF;
 IF v_capacity IS NULL THEN RAISE EXCEPTION '재고를 찾을 수 없어: %',p_id;END IF;
 v_remain:=greatest(0,least(v_capacity,coalesce(v_remain,0)));
 v_take:=least(p_delta,v_remain)::integer;
 IF v_take>0 THEN
   PERFORM public.wise_adjust_inventory_units(p_type,p_id,v_take);
 ELSIF v_remain=0 THEN
   -- A manual stock count may have already reached zero: keep it completed.
   IF p_type='purchase_item' THEN
     UPDATE public.purchase_sale_inventory SET stock_status='soldout',
       remaining_units=0,remaining_quantity=0,sold_out_at=coalesce(sold_out_at,now()),updated_at=now()
     WHERE purchase_item_id=p_id AND stock_status IS DISTINCT FROM 'soldout';
   ELSIF p_type='random_box' THEN
     UPDATE public.sale_random_boxes SET view_status='completed',
       remaining_units=0,updated_at=now()
     WHERE id=p_id AND view_status IS DISTINCT FROM 'completed';
   END IF;
 END IF;
 RETURN v_take;
END;
$function$;