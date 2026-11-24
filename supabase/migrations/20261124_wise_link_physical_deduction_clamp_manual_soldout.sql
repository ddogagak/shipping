CREATE OR REPLACE FUNCTION public.wise_apply_inventory_units_clamped(p_type text,p_id uuid,p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
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
 END IF;
 RETURN v_take;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.wise_save_inventory_links_legacy(p_action text, p_ids bigint[], p_targets jsonb, p_mode text DEFAULT 'future'::text, p_remember boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id bigint; v_sale record; v_target record; v_link public.wise_sale_inventory_links%rowtype;
  v_cutover timestamptz; v_apply boolean; v_previous integer; v_next integer;
  v_saved integer:=0; v_delta integer:=0; v_fingerprint text; v_rule_count integer:=0;
begin
  if p_action not in ('link','unlink') or p_mode not in ('future','historical','link_only') or coalesce(cardinality(p_ids),0) not between 1 and 300 then raise exception '잘못된 연결 요청'; end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then raise exception '재고 선택이 필요해.'; end if;
  if p_action='link' and (jsonb_array_length(p_targets) not between 1 and 16 or cardinality(p_ids)*jsonb_array_length(p_targets)>1200) then raise exception '연결 수량 제한을 확인해줘.'; end if;
  select enabled_at into v_cutover from public.wise_inventory_automation_settings where singleton;
  -- Consistent lock order between overlapping requests.
  for v_id in select distinct x from unnest(p_ids) x order by x loop
    select * into v_sale from public.domestic_wise_item_photo where wise_stock_id=v_id for update;
    if not found then raise exception '판매기록을 찾지 못했어.'; end if;
    v_apply:=p_mode='historical' or (p_mode='future' and v_sale.sold_at>=v_cutover);
    if p_action='unlink' then
      for v_link in select * from public.wise_sale_inventory_links l where l.wise_stock_id=v_id
        and (jsonb_array_length(p_targets)=0 or exists(select 1 from jsonb_to_recordset(p_targets) t(target_type text,target_id uuid) where (t.target_type='purchase_item' and t.target_id=l.purchase_item_id) or (t.target_type='random_box' and t.target_id=l.random_box_id))) order by l.id for update loop
        if v_link.applied_units>0 then
          perform public.wise_adjust_inventory_units(case when v_link.purchase_item_id is not null then 'purchase_item' else 'random_box' end,coalesce(v_link.purchase_item_id,v_link.random_box_id),-v_link.applied_units);
          v_delta:=v_delta-v_link.applied_units;
        end if;
        delete from public.wise_sale_inventory_links where id=v_link.id;
        v_saved:=v_saved+1;
      end loop;
      -- An explicit unlink must not be undone by the next sync of the same sale.
      insert into public.wise_inventory_auto_exclusions(wise_stock_id) values(v_id) on conflict do nothing;
      continue;
    end if;
    for v_target in select * from jsonb_to_recordset(p_targets) t(target_type text,target_id uuid,quantity integer) order by target_type,target_id loop
      if v_target.target_type not in ('purchase_item','random_box') or v_target.target_id is null or v_target.quantity not between 1 and 9999 then raise exception '연결 대상/수량 오류'; end if;
      select * into v_link from public.wise_sale_inventory_links where wise_stock_id=v_id and ((v_target.target_type='purchase_item' and purchase_item_id=v_target.target_id) or (v_target.target_type='random_box' and random_box_id=v_target.target_id)) for update;
      v_previous:=coalesce(v_link.applied_units,0);
      v_next:=case when v_apply then v_target.quantity else v_previous end;
      if not coalesce(v_apply,false) and v_previous>0 and v_target.quantity<>v_previous then raise exception '이미 차감된 연결은 차감 모드에서만 수량을 변경할 수 있어.'; end if;
      if v_next<>v_previous then
        v_next:=v_previous + public.wise_apply_inventory_units_clamped(
          v_target.target_type,v_target.target_id,v_next-v_previous);
      end if;
      if v_link.id is not null then
        update public.wise_sale_inventory_links set quantity=v_target.quantity,applied_units=v_next,updated_at=now() where id=v_link.id;
      else
        insert into public.wise_sale_inventory_links(wise_stock_id,purchase_item_id,random_box_id,quantity,applied_units) values(v_id,case when v_target.target_type='purchase_item' then v_target.target_id end,case when v_target.target_type='random_box' then v_target.target_id end,v_target.quantity,v_next);
      end if;
      v_saved:=v_saved+1; v_delta:=v_delta+v_next-v_previous;
    end loop;
  end loop;
  -- Only remember one unambiguous identity, with a user-confirmed image.
  if p_action='link' and p_remember then
    select count(distinct public.wise_inventory_fingerprint(item_name,image_url,item_price)),min(public.wise_inventory_fingerprint(item_name,image_url,item_price)) into v_rule_count,v_fingerprint from public.domestic_wise_item_photo where wise_stock_id=any(p_ids);
    if v_rule_count=1 and v_fingerprint is not null and not exists(select 1 from public.domestic_wise_item_photo where wise_stock_id=any(p_ids) and public.wise_inventory_fingerprint(item_name,image_url,item_price) is null) then
      insert into public.wise_inventory_match_rules(fingerprint,targets) values(v_fingerprint,p_targets)
      on conflict(fingerprint) do update set targets=excluded.targets,enabled_at=now();
    else v_rule_count:=0; end if;
  end if;
  return jsonb_build_object('count',v_saved,'deducted_units',v_delta,'remembered',v_rule_count=1);
end;
$function$;


CREATE OR REPLACE FUNCTION public.wise_save_inventory_links(p_action text, p_ids bigint[], p_targets jsonb, p_mode text DEFAULT 'future'::text, p_remember boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sid bigint; l public.wise_sale_inventory_links%rowtype; sale record; lot record; a record;
 g uuid; q integer; prev integer; nxt integer; need integer; take integer; alloc jsonb; cutoff timestamptz;
 saved integer:=0; delta integer:=0; result jsonb; fp text; rule_count integer:=0; legacy_targets jsonb;
begin
 perform pg_advisory_xact_lock(74190119);
 if p_action not in ('link','unlink') or p_mode not in ('future','historical','link_only') or coalesce(cardinality(p_ids),0) not between 1 and 300 or jsonb_typeof(p_targets) is distinct from 'array' then raise exception '잘못된 연결 요청'; end if;
 if p_action='link' and not exists(select 1 from jsonb_to_recordset(p_targets) t(target_type text) where t.target_type='inventory_group') then
   if exists(select 1 from public.wise_sale_inventory_links where wise_stock_id=any(p_ids) and inventory_group_id is not null) then raise exception '묶음 연결을 먼저 해제해줘.'; end if;
   return public.wise_save_inventory_links_legacy(p_action,p_ids,p_targets,p_mode,p_remember);
 end if;
 if p_action='link' and jsonb_array_length(p_targets)<>1 then raise exception '동일상품 묶음은 한 번에 하나만 연결해줘.'; end if;
 select enabled_at into cutoff from public.wise_inventory_automation_settings where singleton;
 for sid in select distinct x from unnest(p_ids) x order by x loop
   select * into sale from public.domestic_wise_item_photo where wise_stock_id=sid for update;
   if not found then raise exception '판매기록을 찾지 못했어.'; end if;
   if p_action='unlink' then
     for l in select * from public.wise_sale_inventory_links x where x.wise_stock_id=sid and x.inventory_group_id is not null and (jsonb_array_length(p_targets)=0 or exists(select 1 from jsonb_to_recordset(p_targets) t(target_type text,target_id uuid) where t.target_type='inventory_group' and t.target_id=x.inventory_group_id)) for update loop
       for a in select * from jsonb_to_recordset(l.group_allocations) a(lot_id uuid,units integer) loop
         perform public.wise_adjust_inventory_units('purchase_item',a.lot_id,-a.units);
       end loop;
       delete from public.wise_sale_inventory_links where id=l.id;
       saved:=saved+1;delta:=delta-l.applied_units;
     end loop;
     select coalesce(jsonb_agg(x),'[]'::jsonb) into legacy_targets from jsonb_array_elements(p_targets) x where x->>'target_type'<>'inventory_group';
     if jsonb_array_length(p_targets)=0 or jsonb_array_length(legacy_targets)>0 then
       result:=public.wise_save_inventory_links_legacy('unlink',array[sid],legacy_targets,'link_only',false);
       saved:=saved+(result->>'count')::integer;delta:=delta+(result->>'deducted_units')::integer;
     end if;
     insert into public.wise_inventory_auto_exclusions(wise_stock_id) values(sid) on conflict do nothing;
     continue;
   end if;
   select target_id,quantity into g,q from jsonb_to_recordset(p_targets) t(target_type text,target_id uuid,quantity integer);
   if q is null or q not between 1 and 9999 or not exists(select 1 from public.sale_inventory_groups where id=g and active) then raise exception '묶음 또는 수량을 확인해줘.'; end if;
   if exists(select 1 from public.wise_sale_inventory_links where wise_stock_id=sid and inventory_group_id is distinct from g) then raise exception '기존 연결을 먼저 해제해줘.'; end if;
   select * into l from public.wise_sale_inventory_links where wise_stock_id=sid and inventory_group_id=g for update;
   prev:=coalesce(l.applied_units,0); nxt:=case when p_mode='historical' or (p_mode='future' and sale.sold_at>=cutoff) then q else prev end;
   if nxt=prev and prev>0 and q<>prev then raise exception '차감된 연결은 차감 모드에서만 수량 변경 가능'; end if;
   alloc:=coalesce(l.group_allocations,'[]'::jsonb);
   if nxt>prev then
     need:=nxt-prev;
     for lot in select * from public.sale_inventory_group_lots(g) loop
       exit when need=0; take:=least(need,lot.remaining)::integer;
       if take>0 then perform public.wise_adjust_inventory_units('purchase_item',lot.lot_id,take);alloc:=alloc||jsonb_build_array(jsonb_build_object('lot_id',lot.lot_id,'units',take));need:=need-take;end if;
     end loop;
     if need>0 then nxt:=nxt-need;end if;
   elsif nxt<prev then
     need:=prev-nxt;
     while need>0 loop
       if jsonb_array_length(alloc)=0 then raise exception '묶음 차감 기록이 부족해.';end if;
       take:=least(need,(alloc->-1->>'units')::integer);
       perform public.wise_adjust_inventory_units('purchase_item',(alloc->-1->>'lot_id')::uuid,-take);
       if take=(alloc->-1->>'units')::integer then alloc:=alloc-(-1);
       else alloc:=jsonb_set(alloc,array[(jsonb_array_length(alloc)-1)::text,'units'],to_jsonb((alloc->-1->>'units')::integer-take));end if;
       need:=need-take;
     end loop;
   end if;
   if l.id is null then insert into public.wise_sale_inventory_links(wise_stock_id,inventory_group_id,quantity,applied_units,group_allocations) values(sid,g,q,nxt,alloc);
   else update public.wise_sale_inventory_links set quantity=q,applied_units=nxt,group_allocations=alloc,updated_at=now() where id=l.id;end if;
   saved:=saved+1;delta:=delta+nxt-prev;
 end loop;
 if p_action='link' and p_remember then
   select count(distinct public.wise_inventory_fingerprint(item_name,image_url,item_price)),min(public.wise_inventory_fingerprint(item_name,image_url,item_price)) into rule_count,fp from public.domestic_wise_item_photo where wise_stock_id=any(p_ids);
   if rule_count=1 and fp is not null and not exists(select 1 from public.domestic_wise_item_photo where wise_stock_id=any(p_ids) and public.wise_inventory_fingerprint(item_name,image_url,item_price) is null) then
     insert into public.wise_inventory_match_rules(fingerprint,targets) values(fp,p_targets) on conflict(fingerprint) do update set targets=excluded.targets,enabled_at=now();
   else rule_count:=0;end if;
 end if;
 return jsonb_build_object('count',saved,'deducted_units',delta,'remembered',rule_count=1);
end; $function$;
