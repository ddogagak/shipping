CREATE OR REPLACE FUNCTION public.wise_check_shared_random_box_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE v_box uuid; v_capacity bigint; v_prior bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.quantity<=OLD.quantity
       AND NEW.purchase_item_id IS NOT DISTINCT FROM OLD.purchase_item_id
       AND NEW.random_box_id IS NOT DISTINCT FROM OLD.random_box_id
       AND NEW.inventory_group_id IS NOT DISTINCT FROM OLD.inventory_group_id
    THEN RETURN NEW; END IF;
  END IF;
  v_box:=NEW.random_box_id;
  IF v_box IS NULL AND NEW.purchase_item_id IS NOT NULL THEN
    SELECT m.random_box_id INTO v_box FROM public.sale_random_box_members m WHERE m.purchase_item_id=NEW.purchase_item_id;
  END IF;
  IF v_box IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(74190119);
  -- Use the actual sum of component quantities, not count of designs.
  SELECT public.wise_link_inventory_capacity('random_box',v_box) INTO v_capacity;
  SELECT coalesce(sum(l.quantity),0)::bigint INTO v_prior FROM public.wise_sale_inventory_links l
    WHERE l.id IS DISTINCT FROM NEW.id
      AND (l.random_box_id=v_box OR EXISTS (
        SELECT 1 FROM public.sale_random_box_members m
        WHERE m.random_box_id=v_box AND m.purchase_item_id=l.purchase_item_id
      ));
  IF v_capacity IS NULL OR v_prior+NEW.quantity>v_capacity THEN
    RAISE EXCEPTION '랜덤박스 전체 재고 부족: % (총 %개, 이미 연결 %개, 이번 연결 %개)',
      v_box,coalesce(v_capacity,0),v_prior,NEW.quantity;
  END IF;
  RETURN NEW;
END;
$function$;