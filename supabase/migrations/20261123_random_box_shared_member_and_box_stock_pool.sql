
CREATE OR REPLACE FUNCTION public.wise_random_box_shared_stock()
RETURNS TABLE (random_box_id uuid,capacity bigint,box_matched bigint,member_matched bigint,total_matched bigint,remaining_units bigint)
LANGUAGE sql STABLE SET search_path = ''
AS $shared$
SELECT b.id,
       (greatest(0,coalesce(b.purchase_quantity,0))::bigint * greatest(1,coalesce(b.component_count,1))::bigint),
       coalesce(box_sales.used,0),coalesce(member_sales.used,0),
       coalesce(box_sales.used,0)+coalesce(member_sales.used,0),
       least(
         greatest(0,CASE WHEN b.view_status='completed' THEN 0
           ELSE coalesce(b.remaining_units,(greatest(0,coalesce(b.purchase_quantity,0))::bigint * greatest(1,coalesce(b.component_count,1))::bigint)) END),
         greatest(0,(greatest(0,coalesce(b.purchase_quantity,0))::bigint * greatest(1,coalesce(b.component_count,1))::bigint)
                   -coalesce(box_sales.used,0)-coalesce(member_sales.used,0))
       )
FROM public.sale_random_boxes b
LEFT JOIN LATERAL (SELECT sum(l.quantity)::bigint AS used FROM public.wise_sale_inventory_links l WHERE l.random_box_id=b.id) box_sales ON true
LEFT JOIN LATERAL (
   SELECT sum(l.quantity)::bigint AS used FROM public.wise_sale_inventory_links l
   JOIN public.sale_random_box_members m ON m.purchase_item_id=l.purchase_item_id
   WHERE m.random_box_id=b.id
) member_sales ON true;
$shared$;
REVOKE ALL ON FUNCTION public.wise_random_box_shared_stock() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wise_random_box_shared_stock() TO service_role;

CREATE OR REPLACE FUNCTION public.wise_check_shared_random_box_capacity()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $shared$
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
  SELECT (b.purchase_quantity::bigint * greatest(1,b.component_count)::bigint)
    INTO v_capacity FROM public.sale_random_boxes b WHERE b.id=v_box;
  SELECT coalesce(sum(l.quantity),0)::bigint INTO v_prior FROM public.wise_sale_inventory_links l
    WHERE l.id IS DISTINCT FROM NEW.id
      AND (l.random_box_id=v_box OR EXISTS (
          SELECT 1 FROM public.sale_random_box_members m WHERE m.random_box_id=v_box AND m.purchase_item_id=l.purchase_item_id
        ));
  IF v_capacity IS NULL OR v_prior+NEW.quantity>v_capacity THEN
    RAISE EXCEPTION '랜덤박스 전체 재고 부족: % (총 %개, 이미 연결 %개, 이번 연결 %개)',
      v_box,coalesce(v_capacity,0),v_prior,NEW.quantity;
  END IF;
  RETURN NEW;
END;
$shared$;
DROP TRIGGER IF EXISTS wise_check_shared_random_box_capacity_trg ON public.wise_sale_inventory_links;
CREATE TRIGGER wise_check_shared_random_box_capacity_trg
BEFORE INSERT OR UPDATE OF quantity,purchase_item_id,random_box_id,inventory_group_id
ON public.wise_sale_inventory_links
FOR EACH ROW EXECUTE FUNCTION public.wise_check_shared_random_box_capacity();

CREATE OR REPLACE FUNCTION public.wise_adjust_inventory_units(p_type text, p_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_item record; v_ledger public.purchase_sale_inventory%rowtype;
  v_box public.sale_random_boxes%rowtype; v_count integer; v_boxes bigint;
  v_capacity bigint; v_remaining bigint; v_next bigint; v_meta_count integer;
  v_member_random_box uuid;
begin
  if p_delta = 0 then return; end if;
  if p_type='purchase_item' then
    select m.random_box_id into v_member_random_box
      from public.sale_random_box_members m where m.purchase_item_id=p_id;
    if v_member_random_box is not null then
      perform public.wise_adjust_inventory_units('random_box',v_member_random_box,p_delta);
      return;
    end if;
    select i.*,o.currency,o.source_site,o.order_status,o.raw_data,s.component_count as sourcing_count
      into v_item from public.purchase_items i join public.purchase_orders o on o.id=i.purchase_order_id
      left join public.inventory_items s on s.id=i.sourcing_inventory_id
      where i.id=p_id for update of i;
    if not found or v_item.order_status <> '입고완료' then raise exception '입고완료 재고만 차감할 수 있어.'; end if;
    if exists(select 1 from public.sale_inventory_exclusions where purchase_item_id=p_id) then raise exception '삭제된 판매재고야.'; end if;
    if exists(select 1 from public.sale_random_box_members where purchase_item_id=p_id) then raise exception '랜덤박스 구성품은 랜덤박스 자체에 연결해줘.'; end if;
    select * into v_ledger from public.purchase_sale_inventory where purchase_item_id=p_id for update;
    if jsonb_typeof(v_item.raw_data->'domestic_items')='array' then
      select case when x->>'component_count' ~ '^[0-9]{1,6}$' then (x->>'component_count')::integer end into v_meta_count
      from jsonb_array_elements(v_item.raw_data->'domestic_items') x
      where coalesce(x->>'product_name','')=coalesce(v_item.product_name,'') and coalesce(x->>'option_text','')=coalesce(v_item.option_text,'') limit 1;
    end if;
    v_count:=greatest(1,coalesce(nullif(v_ledger.component_count_override,0),nullif(v_item.component_count,0),nullif(v_meta_count,0),nullif(v_item.sourcing_count,0),1));
    v_boxes:=coalesce(v_ledger.box_quantity_override,case when (v_item.currency='KRW' or v_item.source_site='Domestic') and coalesce(v_item.received_quantity,0)=0 then v_item.quantity else coalesce(v_item.received_quantity,0) end,0);
    v_capacity:=v_boxes*v_count;
    v_remaining:=case when v_ledger.stock_status='soldout' then 0 else coalesce(v_ledger.remaining_units,v_ledger.remaining_quantity::bigint*v_count,v_capacity) end;
    v_next:=v_remaining-p_delta;
    if v_next<0 or v_next>v_capacity then raise exception '잔여 낱개 수량 부족 또는 초과: % (현재 %, 요청 %)',p_id,v_remaining,p_delta; end if;
    insert into public.purchase_sale_inventory(purchase_item_id,remaining_units,remaining_quantity,sold_quantity,stock_status,sold_out_at)
      values(p_id,v_next,ceil(v_next::numeric/v_count)::integer,floor((v_capacity-v_next)::numeric/v_count)::integer,case when v_next=0 then 'soldout' else 'active' end,case when v_next=0 then now() end)
      on conflict(purchase_item_id) do update set remaining_units=excluded.remaining_units,remaining_quantity=excluded.remaining_quantity,sold_quantity=excluded.sold_quantity,
        stock_status=excluded.stock_status,sold_out_at=excluded.sold_out_at,updated_at=now();
  elsif p_type='random_box' then
    select * into v_box from public.sale_random_boxes where id=p_id for update;
    if not found then raise exception '랜덤박스를 찾을 수 없어.'; end if;
    v_capacity:=v_box.purchase_quantity::bigint*greatest(1,v_box.component_count);
    v_remaining:=case when v_box.view_status='completed' then 0 else coalesce(v_box.remaining_units,v_capacity) end;
    v_next:=v_remaining-p_delta;
    if v_next<0 or v_next>v_capacity then raise exception '랜덤박스 잔여 낱개 수량 부족 또는 초과: 현재 %, 요청 %',v_remaining,p_delta; end if;
    update public.sale_random_boxes set remaining_units=v_next,view_status=case when v_next=0 then 'completed' when view_status='completed' then 'display' else view_status end,updated_at=now() where id=p_id;
  else raise exception '잘못된 재고 유형'; end if;
end;
$function$;
