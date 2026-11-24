ALTER TABLE public.sale_random_boxes ADD COLUMN IF NOT EXISTS stock_capacity_units bigint;
DO $constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sale_random_boxes_stock_capacity_units_positive') THEN
  ALTER TABLE public.sale_random_boxes ADD CONSTRAINT sale_random_boxes_stock_capacity_units_positive CHECK(stock_capacity_units IS NULL OR stock_capacity_units>=1);
 END IF;
END $constraint$;
WITH totals AS (
 SELECT random_box_id,sum(greatest(0,original_box_quantity)::bigint*greatest(1,component_count)::bigint) total_units
 FROM public.sale_random_box_members GROUP BY random_box_id
)
UPDATE public.sale_random_boxes b SET
 stock_capacity_units=t.total_units,
 remaining_units=CASE WHEN b.view_status='completed' THEN b.remaining_units
  WHEN b.remaining_units IS NULL THEN NULL
  ELSE greatest(0,t.total_units-(b.purchase_quantity::bigint*greatest(1,b.component_count)::bigint-b.remaining_units)) END,
 updated_at=now()
FROM totals t WHERE t.random_box_id=b.id AND t.total_units>0 AND b.stock_capacity_units IS NULL;

CREATE OR REPLACE FUNCTION public.wise_link_inventory_capacity(p_type text, p_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_capacity bigint;
BEGIN
  IF p_type = 'purchase_item' THEN
    SELECT greatest(0,coalesce(pl.box_quantity_override,
        CASE WHEN (upper(coalesce(po.currency,''))='KRW' OR po.source_site='Domestic')
                    AND coalesce(pi.received_quantity,0)=0
          THEN coalesce(pi.quantity,0) ELSE coalesce(pi.received_quantity,0) END,0))::bigint
       * greatest(1,coalesce(nullif(pl.component_count_override,0),nullif(pi.component_count,0),
                  nullif(dm.component_count,0),nullif(si.component_count,0),1))::bigint
      INTO v_capacity
    FROM public.purchase_items pi
    JOIN public.purchase_orders po ON po.id=pi.purchase_order_id
    LEFT JOIN public.purchase_sale_inventory pl ON pl.purchase_item_id=pi.id
    LEFT JOIN public.inventory_items si ON si.id=pi.sourcing_inventory_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN j.value->>'component_count' ~ '^[1-9][0-9]{0,5}$'
                  THEN (j.value->>'component_count')::integer END AS component_count
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(po.raw_data->'domestic_items')='array'
         THEN po.raw_data->'domestic_items' ELSE '[]'::jsonb END) j
      WHERE coalesce(j.value->>'product_name','')=coalesce(pi.product_name,'')
        AND coalesce(j.value->>'option_text','')=coalesce(pi.option_text,'')
      LIMIT 1
    ) dm ON true
    WHERE pi.id=p_id;
  ELSIF p_type = 'random_box' THEN
    SELECT coalesce(b.stock_capacity_units,greatest(0,coalesce(b.purchase_quantity,0))::bigint
      * greatest(1,coalesce(b.component_count,1))::bigint)
      INTO v_capacity FROM public.sale_random_boxes b WHERE b.id=p_id;
  ELSIF p_type = 'inventory_group' THEN
    SELECT sum(public.wise_link_inventory_capacity('purchase_item',m.purchase_item_id))
      INTO v_capacity FROM public.sale_inventory_group_members m WHERE m.group_id=p_id;
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_capacity;
END;
$function$;

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
    if exists(select 1 from public.sale_random_box_members where purchase_item_id=p_id) then
      perform public.wise_adjust_inventory_units('random_box',
        (select m.random_box_id from public.sale_random_box_members m where m.purchase_item_id=p_id limit 1), p_delta);
      return;
    end if;
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
    v_capacity:=coalesce(v_box.stock_capacity_units,v_box.purchase_quantity::bigint*greatest(1,v_box.component_count));
    v_remaining:=case when v_box.view_status='completed' then 0 else coalesce(v_box.remaining_units,v_capacity) end;
    v_next:=v_remaining-p_delta;
    if v_next<0 or v_next>v_capacity then raise exception '랜덤박스 잔여 낱개 수량 부족 또는 초과: 현재 %, 요청 %',v_remaining,p_delta; end if;
    update public.sale_random_boxes set remaining_units=v_next,view_status=case when v_next=0 then 'completed' when view_status='completed' then 'display' else view_status end,updated_at=now() where id=p_id;
  else raise exception '잘못된 재고 유형'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.wise_check_link_quantity_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_capacity bigint; v_current bigint; v_group uuid; v_name text;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity<1 THEN
    RAISE EXCEPTION '매칭 수량은 1개 이상이어야 해.';
  END IF;

  -- Pre-existing overmatches can be corrected/unlinked, and metadata-only
  -- updates must not break; changing targets is not a metadata-only update.
  IF TG_OP='UPDATE' THEN
    IF NEW.quantity<=OLD.quantity
      AND NEW.purchase_item_id IS NOT DISTINCT FROM OLD.purchase_item_id
      AND NEW.random_box_id IS NOT DISTINCT FROM OLD.random_box_id
      AND NEW.inventory_group_id IS NOT DISTINCT FROM OLD.inventory_group_id
    THEN RETURN NEW; END IF;
  END IF;

  -- Serialize with existing Wise link/save/auto-match procedures.
  PERFORM pg_catalog.pg_advisory_xact_lock(74190119);

  IF NEW.purchase_item_id IS NOT NULL THEN
    v_capacity:=public.wise_link_inventory_capacity('purchase_item',NEW.purchase_item_id);
    SELECT coalesce(sum(l.quantity),0) INTO v_current
      FROM public.wise_sale_inventory_links l
      WHERE l.purchase_item_id=NEW.purchase_item_id AND l.id IS DISTINCT FROM NEW.id;
    IF v_capacity IS NULL OR v_current+NEW.quantity>v_capacity THEN
      RAISE EXCEPTION '재고 과매칭 차단: 매입상품 % (총 %개 / 기존 연결 %개 / 추가 %개)',
        NEW.purchase_item_id,coalesce(v_capacity,0),v_current,NEW.quantity;
    END IF;

    -- Individual member sales also reserve units from the parent random pool.
    FOR v_group IN SELECT m.random_box_id FROM public.sale_random_box_members m WHERE m.purchase_item_id=NEW.purchase_item_id LOOP
      v_capacity:=public.wise_link_inventory_capacity('random_box',v_group);
      SELECT coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
        WHERE l.random_box_id=v_group AND l.id IS DISTINCT FROM NEW.id),0)
       +coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
         JOIN public.sale_random_box_members m ON m.purchase_item_id=l.purchase_item_id
         WHERE m.random_box_id=v_group AND l.id IS DISTINCT FROM NEW.id),0)
        INTO v_current;
      IF v_capacity IS NULL OR v_current+NEW.quantity>v_capacity THEN
        RAISE EXCEPTION '랜덤박스 통합 재고 초과: % (총 %개 / 기존 연결 %개 / 추가 %개)',
          v_group,coalesce(v_capacity,0),v_current,NEW.quantity;
      END IF;
    END LOOP;

    -- Direct purchase-lot links also consume capacity of any pooled group.
    FOR v_group IN SELECT gm.group_id FROM public.sale_inventory_group_members gm
       WHERE gm.purchase_item_id=NEW.purchase_item_id
    LOOP
      v_capacity:=public.wise_link_inventory_capacity('inventory_group',v_group);
      SELECT coalesce((
          SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
          WHERE l.inventory_group_id=v_group AND l.id IS DISTINCT FROM NEW.id
        ),0)
        + coalesce((
          SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
          JOIN public.sale_inventory_group_members gm ON gm.purchase_item_id=l.purchase_item_id
          WHERE gm.group_id=v_group AND l.id IS DISTINCT FROM NEW.id
        ),0)
        INTO v_current;
      IF v_capacity IS NULL OR v_current+NEW.quantity>v_capacity THEN
        RAISE EXCEPTION '묶음 재고 과매칭 차단: % (총 %개 / 기존 연결 %개 / 추가 %개)',
          v_group,coalesce(v_capacity,0),v_current,NEW.quantity;
      END IF;
    END LOOP;
  ELSIF NEW.random_box_id IS NOT NULL THEN
    v_capacity:=public.wise_link_inventory_capacity('random_box',NEW.random_box_id);
    SELECT coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
      WHERE l.random_box_id=NEW.random_box_id AND l.id IS DISTINCT FROM NEW.id),0)
      +coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
      JOIN public.sale_random_box_members m ON m.purchase_item_id=l.purchase_item_id
      WHERE m.random_box_id=NEW.random_box_id AND l.id IS DISTINCT FROM NEW.id),0)
      INTO v_current;
    IF v_capacity IS NULL OR v_current+NEW.quantity>v_capacity THEN
      RAISE EXCEPTION '랜덤박스 과매칭 차단: % (총 %개 / 기존 연결 %개 / 추가 %개)',
        NEW.random_box_id,coalesce(v_capacity,0),v_current,NEW.quantity;
    END IF;
  ELSIF NEW.inventory_group_id IS NOT NULL THEN
    v_capacity:=public.wise_link_inventory_capacity('inventory_group',NEW.inventory_group_id);
    SELECT coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
       WHERE l.inventory_group_id=NEW.inventory_group_id AND l.id IS DISTINCT FROM NEW.id),0)
       + coalesce((SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
         JOIN public.sale_inventory_group_members gm ON gm.purchase_item_id=l.purchase_item_id
         WHERE gm.group_id=NEW.inventory_group_id AND l.id IS DISTINCT FROM NEW.id),0)
      INTO v_current;
    IF v_capacity IS NULL OR v_current+NEW.quantity>v_capacity THEN
      RAISE EXCEPTION '묶음 재고 과매칭 차단: % (총 %개 / 기존 연결 %개 / 추가 %개)',
        NEW.inventory_group_id,coalesce(v_capacity,0),v_current,NEW.quantity;
    END IF;
  ELSE
    RAISE EXCEPTION '매칭할 재고 ID가 없어.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_sale_random_box(p_title text, p_image_url text, p_members jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
  v_id uuid;
  v_series_tags text[];
  v_cost numeric;
  v_memo text;
  v_member record;
  v_count_existing integer;
  v_eligible integer;
  v_quantity integer;
  v_total_units bigint;
BEGIN
  IF length(trim(coalesce(p_title,''))) < 1 OR length(p_title)>200 THEN
    RAISE EXCEPTION '랜덤박스 제목을 확인해줘.';
  END IF;
  IF p_image_url IS NULL OR left(p_image_url,8) <> 'https://' OR length(p_image_url)>2000 OR p_image_url ~ '[[:space:]]' THEN
    RAISE EXCEPTION '합성 대표이미지가 필요해.';
  END IF;
  IF jsonb_typeof(p_members) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '선택 상품 목록이 필요해.';
  END IF;
  v_count := jsonb_array_length(p_members);
  IF v_count < 2 OR v_count > 40 THEN
    RAISE EXCEPTION '랜덤박스는 2~40개 상품을 선택해야 해.';
  END IF;
  SELECT count(DISTINCT x.purchase_item_id), count(*), coalesce(sum(x.unit_cost_krw),0),
         string_agg(x.item_name || ' ' || x.original_box_quantity || '개', ', ' ORDER BY x.item_name)
    INTO v_count_existing, v_eligible, v_cost, v_memo
    FROM jsonb_to_recordset(p_members)
         AS x(purchase_item_id uuid,item_name text,original_box_quantity integer,
         component_count integer,unit_purchase_price numeric,currency text,
         unit_cost_krw numeric,image_url text);
  IF v_count_existing <> v_count OR v_eligible <> v_count OR v_cost < 0 THEN
    RAISE EXCEPTION '선택 상품에 중복되거나 잘못된 데이터가 있어.';
  END IF;
  SELECT count(*) INTO v_eligible
    FROM jsonb_to_recordset(p_members) AS x(purchase_item_id uuid,item_name text,
      original_box_quantity integer,component_count integer,unit_purchase_price numeric,
      currency text,unit_cost_krw numeric,image_url text)
    JOIN public.purchase_items pi ON pi.id=x.purchase_item_id
    JOIN public.purchase_orders po ON po.id=pi.purchase_order_id
    LEFT JOIN public.purchase_sale_inventory si ON si.purchase_item_id=pi.id
    WHERE po.order_status='입고완료'
      AND coalesce(si.stock_status,'active')<>'soldout'
      AND x.item_name IS NOT NULL AND length(trim(x.item_name))>0
      AND x.component_count>0 AND x.original_box_quantity>0
      AND x.unit_purchase_price>=0 AND x.unit_cost_krw>=0
      AND x.currency IN ('JPY','CNY','KRW')
      AND coalesce(x.image_url,'') ~ '^https?://';
  IF v_eligible<>v_count THEN
    RAISE EXCEPTION '입고완료되지 않았거나 선택 불가능한 상품이 포함됐어.';
  END IF;
  -- Retain every distinct series tag from the selected source items.
  SELECT coalesce(array_agg(DISTINCT trim(x.series_name)) FILTER (
    WHERE x.series_name IS NOT NULL AND length(trim(x.series_name)) BETWEEN 1 AND 100
      AND trim(x.series_name) NOT IN ('전체','랜덤박스')),ARRAY[]::text[])
    INTO v_series_tags
    FROM jsonb_to_recordset(p_members) AS x(series_name text);
  SELECT coalesce(sum(x.original_box_quantity::bigint*x.component_count::bigint),0)
    INTO v_total_units FROM jsonb_to_recordset(p_members)
    AS x(original_box_quantity integer,component_count integer);
  IF v_total_units<1 THEN RAISE EXCEPTION '랜덤박스 구성품 수량 합계가 올바르지 않아.'; END IF;
  INSERT INTO public.sale_random_boxes(title,image_url,sale_memo,component_count,total_cost_krw,series_tags,stock_capacity_units)
    VALUES (trim(p_title),p_image_url,coalesce(v_memo,''),v_count,v_cost,v_series_tags,v_total_units)
    RETURNING id INTO v_id;
  INSERT INTO public.sale_random_box_members(random_box_id,purchase_item_id,item_name,
    original_box_quantity,component_count,unit_purchase_price,currency,unit_cost_krw,image_url)
    SELECT v_id,x.purchase_item_id,x.item_name,x.original_box_quantity,x.component_count,
      x.unit_purchase_price,x.currency,x.unit_cost_krw,x.image_url
    FROM jsonb_to_recordset(p_members) AS x(purchase_item_id uuid,item_name text,
      original_box_quantity integer,component_count integer,unit_purchase_price numeric,
      currency text,unit_cost_krw numeric,image_url text);
  FOR v_member IN SELECT purchase_item_id,original_box_quantity FROM public.sale_random_box_members WHERE random_box_id=v_id LOOP
    INSERT INTO public.purchase_sale_inventory(
      purchase_item_id,stock_status,remaining_quantity,sold_quantity,sale_memo)
      VALUES (v_member.purchase_item_id,'active',v_member.original_box_quantity,0,'[[HIDDEN]]')
      ON CONFLICT (purchase_item_id) DO UPDATE
        SET sale_memo=CASE WHEN coalesce(public.purchase_sale_inventory.sale_memo,'') LIKE '[[HIDDEN]]%'
          THEN public.purchase_sale_inventory.sale_memo
          ELSE '[[HIDDEN]]'||coalesce(public.purchase_sale_inventory.sale_memo,'') END;
  END LOOP;
  RETURN v_id;
END;
$function$;