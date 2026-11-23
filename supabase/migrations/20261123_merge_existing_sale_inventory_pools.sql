
CREATE OR REPLACE FUNCTION public.merge_sale_inventory_pools(p_target uuid,p_sources uuid[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_count integer; v_moved integer;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(74190119);
 IF p_target IS NULL OR cardinality(p_sources)<1 OR cardinality(p_sources)>99
    OR p_target=ANY(p_sources) THEN RAISE EXCEPTION '합칠 재고풀을 다시 선택해줘.'; END IF;
 SELECT count(DISTINCT id) INTO v_count FROM public.sale_inventory_groups
 WHERE active AND group_kind='sale_pool' AND (id=p_target OR id=ANY(p_sources));
 IF v_count<>cardinality(p_sources)+1 THEN
   RAISE EXCEPTION '활성 재고풀만 합칠 수 있어. 중복 선택을 확인해줘.';
 END IF;
 IF (SELECT count(*) FROM unnest(p_sources) s)<>(SELECT count(DISTINCT s) FROM unnest(p_sources) s) THEN
   RAISE EXCEPTION '같은 재고풀이 중복 선택됐어.';
 END IF;
 PERFORM 1 FROM public.sale_inventory_groups WHERE id=p_target FOR UPDATE;
 PERFORM 1 FROM public.sale_inventory_groups WHERE id=ANY(p_sources) FOR UPDATE;
 -- Do not merge lots that are in random boxes or excluded from stock.
 IF EXISTS(
  SELECT 1 FROM public.sale_inventory_group_members m
  WHERE m.group_id=ANY(p_sources)
    AND (EXISTS(SELECT 1 FROM public.sale_random_box_members rb WHERE rb.purchase_item_id=m.purchase_item_id)
         OR EXISTS(SELECT 1 FROM public.sale_inventory_exclusions e WHERE e.purchase_item_id=m.purchase_item_id))
 ) THEN RAISE EXCEPTION '구성상품 중 랜덤박스 또는 제외 재고가 있어 합칠 수 없어.'; END IF;
 UPDATE public.sale_inventory_group_members SET group_id=p_target WHERE group_id=ANY(p_sources);
 GET DIAGNOSTICS v_moved=ROW_COUNT;
 -- Repoint existing links, keeping FIFO lot allocations, sales, and prices unchanged.
 UPDATE public.wise_sale_inventory_links SET inventory_group_id=p_target WHERE inventory_group_id=ANY(p_sources);
 UPDATE public.wise_inventory_match_rules r
 SET targets=(
   SELECT jsonb_agg(CASE WHEN t.value->>'target_type'='inventory_group'
       AND (t.value->>'target_id')::uuid=ANY(p_sources)
     THEN jsonb_set(t.value,'{target_id}',to_jsonb(p_target::text))
     ELSE t.value END ORDER BY t.ordinality)
   FROM jsonb_array_elements(r.targets) WITH ORDINALITY t(value,ordinality)
 )
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(r.targets) t
  WHERE t->>'target_type'='inventory_group'
    AND (t->>'target_id')::uuid=ANY(p_sources));
 UPDATE public.sale_inventory_groups SET active=false WHERE id=ANY(p_sources);
 RETURN p_target;
END;
$fn$;
REVOKE ALL ON FUNCTION public.merge_sale_inventory_pools(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.merge_sale_inventory_pools(uuid,uuid[]) TO service_role;
