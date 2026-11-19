-- A purchase can be associated with a stock group before receipt. Only the
-- membership changes; purchase prices, quantities and stock ledgers stay intact.
create function public.match_purchase_stock(p_action text,p_purchase_item_id uuid,p_target_type text,p_target_id uuid)
returns uuid language plpgsql set search_path='' as $$
declare g uuid; previous_group uuid; anchor uuid; group_title text;
begin
 perform pg_advisory_xact_lock(74190119);
 if p_action not in ('link','unlink') then raise exception '잘못된 재고 연결 요청'; end if;
 perform 1 from public.purchase_items where id=p_purchase_item_id for update;
 if not found then raise exception '매입 상품을 찾지 못했어.'; end if;
 select group_id into previous_group from public.sale_inventory_group_members where purchase_item_id=p_purchase_item_id;
 if p_action='unlink' then
   delete from public.sale_inventory_group_members where purchase_item_id=p_purchase_item_id;
   return previous_group;
 end if;
 if not exists(select 1 from public.purchase_items i join public.purchase_orders o on o.id=i.purchase_order_id
   where i.id=p_purchase_item_id and coalesce(o.order_status,'주문완료')<>'취소' and coalesce(o.raw_data->>'simple_purchase','false')<>'true')
   or exists(select 1 from public.sale_inventory_exclusions where purchase_item_id=p_purchase_item_id)
   or exists(select 1 from public.sale_random_box_members where purchase_item_id=p_purchase_item_id) then
   raise exception '취소·제외·랜덤박스 구성 상품은 연결할 수 없어.';
 end if;
 if p_target_type='group' then
   select id into g from public.sale_inventory_groups where id=p_target_id and active for update;
   if g is null or not exists(select 1 from public.sale_inventory_group_members m join public.purchase_items i on i.id=m.purchase_item_id join public.purchase_orders o on o.id=i.purchase_order_id where m.group_id=g and o.order_status='입고완료' and i.id<>p_purchase_item_id) then
     raise exception '입고완료 재고가 있는 묶음을 선택해줘.';
   end if;
 elsif p_target_type='lot' then
   if p_target_id=p_purchase_item_id then raise exception '같은 매입 상품에는 연결할 수 없어.'; end if;
   select i.id,left(coalesce(nullif(trim(i.display_name_ko),''),nullif(trim(i.product_name),''),'동일상품 묶음'),200) into anchor,group_title
   from public.purchase_items i join public.purchase_orders o on o.id=i.purchase_order_id
   where i.id=p_target_id and o.order_status='입고완료' for update of i;
   if anchor is null or exists(select 1 from public.sale_inventory_exclusions where purchase_item_id=anchor) or exists(select 1 from public.sale_random_box_members where purchase_item_id=anchor) then
     raise exception '입고완료된 독립 재고만 선택할 수 있어.';
   end if;
   select m.group_id into g from public.sale_inventory_group_members m join public.sale_inventory_groups s on s.id=m.group_id and s.active where m.purchase_item_id=anchor;
 else raise exception '재고 연결 대상을 확인해줘.';
 end if;
 if previous_group is not null then
   if previous_group=g then return g; end if;
   raise exception '이미 다른 재고에 연결된 상품이야. 기존 연결을 먼저 해제해줘.';
 end if;
 if g is null then
   insert into public.sale_inventory_groups(title) values(group_title) returning id into g;
   insert into public.sale_inventory_group_members(purchase_item_id,group_id) values(anchor,g);
 end if;
 insert into public.sale_inventory_group_members(purchase_item_id,group_id) values(p_purchase_item_id,g);
 -- Match rules follow the new logical product; original sales and deductions are untouched.
 update public.wise_inventory_match_rules r set targets=jsonb_build_array(jsonb_build_object('target_type','inventory_group','target_id',g,'quantity',(r.targets->0->>'quantity')::integer))
 where jsonb_array_length(r.targets)=1 and r.targets->0->>'target_type'='purchase_item' and r.targets->0->>'target_id' in (select purchase_item_id::text from public.sale_inventory_group_members where group_id=g);
 return g;
end; $$;
revoke all on function public.match_purchase_stock(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.match_purchase_stock(text,uuid,text,uuid) to service_role;
