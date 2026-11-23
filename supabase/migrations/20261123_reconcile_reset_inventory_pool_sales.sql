-- Reconcile manually reset inventory pools without discarding previous sale-link history.
-- This operation is only used after the user explicitly confirms that the selected
-- inventory was reset and should be deducted again from its current balance.
CREATE TABLE IF NOT EXISTS public.wise_inventory_pool_relink_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid NOT NULL,
  wise_stock_id bigint NOT NULL,
  target_group_id uuid NOT NULL,
  previous_link jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wise_inventory_pool_relink_audit_batch_idx
  ON public.wise_inventory_pool_relink_audit (batch_id);
REVOKE ALL ON public.wise_inventory_pool_relink_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.wise_inventory_pool_relink_audit TO service_role;

CREATE OR REPLACE FUNCTION public.wise_reconcile_inventory_pool_from_reset(
  p_ids bigint[], p_group_id uuid, p_quantity integer, p_remember boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_batch uuid := pg_catalog.gen_random_uuid();
  v_found integer;
  v_sale record;
  v_old public.wise_sale_inventory_links%rowtype;
  v_remaining bigint;
  v_capacity bigint;
  v_result jsonb;
  v_saved integer := 0;
  v_migrated integer := 0;
  v_deducted integer := 0;
  v_remembered boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(74190119);
  IF coalesce(pg_catalog.cardinality(p_ids),0) NOT BETWEEN 1 AND 300
    OR p_group_id IS NULL OR p_quantity NOT BETWEEN 1 AND 9999
    OR (SELECT count(DISTINCT id) FROM pg_catalog.unnest(p_ids) id) <> pg_catalog.cardinality(p_ids)
    OR NOT EXISTS (
      SELECT 1 FROM public.sale_inventory_groups
      WHERE id=p_group_id AND active AND group_kind='sale_pool'
    )
  THEN RAISE EXCEPTION '통합 재고풀 또는 선택 판매 수량을 확인해줘.'; END IF;

  SELECT count(*) INTO v_found FROM public.domestic_wise_item_photo
  WHERE wise_stock_id=ANY(p_ids) AND video_id IS NOT NULL;
  IF v_found<>pg_catalog.cardinality(p_ids) THEN
    RAISE EXCEPTION '판매기록이 누락됐거나 방송 정보가 없어. 다시 조회해줘.';
  END IF;

  -- Check every previously deducted lot before changing ANY balance.
  -- Validation must happen before the loop because the first re-deduction
  -- intentionally makes the original lot no longer full.
  FOR v_old IN
    SELECT l.* FROM public.wise_sale_inventory_links l
    WHERE l.wise_stock_id=ANY(p_ids)
      AND l.inventory_group_id IS DISTINCT FROM p_group_id
      AND l.applied_units>0
    ORDER BY l.id
  LOOP
    IF v_old.purchase_item_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sale_inventory_group_members m
      WHERE m.group_id=p_group_id AND m.purchase_item_id=v_old.purchase_item_id
    ) THEN
      RAISE EXCEPTION '판매 %의 기존 차감 대상은 통합 재고풀 밖이야. 안전하게 자동 이동할 수 없어.',v_old.wise_stock_id;
    END IF;
    SELECT remaining INTO v_remaining FROM public.sale_inventory_group_lots(p_group_id)
    WHERE lot_id=v_old.purchase_item_id;
    v_capacity:=public.wise_link_inventory_capacity('purchase_item',v_old.purchase_item_id);
    IF v_remaining IS NULL OR v_capacity IS NULL OR v_remaining<>v_capacity THEN
      RAISE EXCEPTION '판매 %의 기존 차감 재고가 완전히 초기화되지 않았어. 해당 재고부터 확인해줘.',v_old.wise_stock_id;
    END IF;
  END LOOP;

  -- Oldest sales first; the existing grouped deduction routine selects the
  -- oldest *purchase lots* first within each sale.
  FOR v_sale IN
    SELECT wise_stock_id FROM public.domestic_wise_item_photo
    WHERE wise_stock_id=ANY(p_ids) ORDER BY sold_at NULLS LAST,wise_stock_id
  LOOP
    PERFORM 1 FROM public.domestic_wise_item_photo
    WHERE wise_stock_id=v_sale.wise_stock_id FOR UPDATE;

    FOR v_old IN
      SELECT * FROM public.wise_sale_inventory_links
      WHERE wise_stock_id=v_sale.wise_stock_id
        AND inventory_group_id IS DISTINCT FROM p_group_id
      ORDER BY id FOR UPDATE
    LOOP
      INSERT INTO public.wise_inventory_pool_relink_audit
        (batch_id,wise_stock_id,target_group_id,previous_link)
      VALUES (v_batch,v_sale.wise_stock_id,p_group_id,to_jsonb(v_old));
      DELETE FROM public.wise_sale_inventory_links WHERE id=v_old.id;
      v_migrated:=v_migrated+1;
    END LOOP;

    v_result:=public.wise_save_inventory_links(
      'link',ARRAY[v_sale.wise_stock_id],
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'target_type','inventory_group','target_id',p_group_id,'quantity',p_quantity
      )),'historical',p_remember
    );
    v_saved:=v_saved+coalesce((v_result->>'count')::integer,0);
    v_deducted:=v_deducted+coalesce((v_result->>'deducted_units')::integer,0);
    v_remembered:=v_remembered OR coalesce((v_result->>'remembered')::boolean,false);
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'count',v_saved,'deducted_units',v_deducted,
    'migrated_links',v_migrated,'remembered',v_remembered,
    'audit_batch_id',v_batch
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.wise_reconcile_inventory_pool_from_reset(bigint[],uuid,integer,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wise_reconcile_inventory_pool_from_reset(bigint[],uuid,integer,boolean)
  TO service_role;
