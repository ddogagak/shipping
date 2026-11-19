-- Groups are metadata only; original purchase and ledger rows are never merged.
create table public.sale_inventory_groups (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 200),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.sale_inventory_group_members (
 purchase_item_id uuid primary key references public.purchase_items(id) on delete restrict,
 group_id uuid not null references public.sale_inventory_groups(id) on delete restrict
);
create index sale_inventory_group_members_group_idx on public.sale_inventory_group_members(group_id);
alter table public.sale_inventory_groups enable row level security;
alter table public.sale_inventory_group_members enable row level security;
revoke all on public.sale_inventory_groups,public.sale_inventory_group_members from public,anon,authenticated;
grant select,insert,update,delete on public.sale_inventory_groups,public.sale_inventory_group_members to service_role;
alter table public.wise_sale_inventory_links add column inventory_group_id uuid references public.sale_inventory_groups(id) on delete restrict;
alter table public.wise_sale_inventory_links add column group_allocations jsonb not null default '[]'::jsonb check(jsonb_typeof(group_allocations)='array');
alter table public.wise_sale_inventory_links drop constraint if exists wise_sale_inventory_links_exactly_one_target;
alter table public.wise_sale_inventory_links add constraint wise_sale_inventory_links_exactly_one_target check(num_nonnulls(purchase_item_id,random_box_id,inventory_group_id)=1);
create unique index wise_sale_inventory_links_sale_group_uq on public.wise_sale_inventory_links(wise_stock_id,inventory_group_id) where inventory_group_id is not null;
create index wise_sale_inventory_links_group_idx on public.wise_sale_inventory_links(inventory_group_id) where inventory_group_id is not null;

-- A group can be extended with new purchase lots or dissolved without touching any balances.
create function public.manage_sale_inventory_group(p_action text,p_group_id uuid,p_title text,p_member_ids uuid[])
returns uuid language plpgsql set search_path='' as $$
declare g uuid; n integer; k uuid;
begin
 perform pg_advisory_xact_lock(74190119);
 if p_action='dissolve' then
   update public.sale_inventory_groups set active=false where id=p_group_id and active returning id into g;
   if g is null then raise exception '묶음을 찾을 수 없어.'; end if;
   delete from public.sale_inventory_group_members where group_id=g;
   return g;
 end if;
 if p_action not in ('create','add') then raise exception '잘못된 묶음 작업'; end if;
 select count(distinct x) into n from unnest(p_member_ids) x;
 if n<>coalesce(cardinality(p_member_ids),0) or n>100 or n<(case when p_action='create' then 2 else 1 end) then raise exception '선택 수량을 확인해줘.'; end if;
 for k in select x from unnest(p_member_ids) x order by x loop
   perform 1 from public.purchase_items i join public.purchase_orders o on o.id=i.purchase_order_id where i.id=k and o.order_status='입고완료' for update of i;
   if not found or exists(select 1 from public.sale_inventory_exclusions where purchase_item_id=k) or exists(select 1 from public.sale_random_box_members where purchase_item_id=k) or exists(select 1 from public.sale_inventory_group_members where purchase_item_id=k) then raise exception '입고완료된 독립 상품만 묶을 수 있어.'; end if;
 end loop;
 if p_action='create' then insert into public.sale_inventory_groups(title) values(trim(p_title)) returning id into g;
 else select id into g from public.sale_inventory_groups where id=p_group_id and active for update; if g is null then raise exception '묶음을 찾을 수 없어.'; end if; end if;
 insert into public.sale_inventory_group_members(purchase_item_id,group_id) select x,g from unnest(p_member_ids) x;
 -- Existing single-product remembered match follows its group on future sales.
 update public.wise_inventory_match_rules r set targets=jsonb_build_array(jsonb_build_object('target_type','inventory_group','target_id',g,'quantity',(r.targets->0->>'quantity')::integer))
 where jsonb_array_length(r.targets)=1 and r.targets->0->>'target_type'='purchase_item' and r.targets->0->>'target_id' in (select x::text from unnest(p_member_ids) x);
 return g;
end; $$;

-- Match the original unit-balance calculation (including legacy soldout states).
create function public.sale_inventory_group_lots(p_group_id uuid)
returns table(lot_id uuid,remaining bigint,ordered_at timestamptz) language sql stable set search_path='' as $$
 select i.id,case when l.stock_status='soldout' then 0 else coalesce(l.remaining_units,l.remaining_quantity::bigint*c.n,coalesce(l.box_quantity_override,case when (o.currency='KRW' or o.source_site='Domestic') and coalesce(i.received_quantity,0)=0 then i.quantity else coalesce(i.received_quantity,0) end,0)::bigint*c.n) end,o.ordered_at::timestamptz
 from public.sale_inventory_group_members m join public.purchase_items i on i.id=m.purchase_item_id join public.purchase_orders o on o.id=i.purchase_order_id
 left join public.purchase_sale_inventory l on l.purchase_item_id=i.id left join public.inventory_items s on s.id=i.sourcing_inventory_id
 left join lateral (select case when x->>'component_count' ~ '^[0-9]{1,6}$' then (x->>'component_count')::integer end n from jsonb_array_elements(case when jsonb_typeof(o.raw_data->'domestic_items')='array' then o.raw_data->'domestic_items' else '[]'::jsonb end) x where coalesce(x->>'product_name','')=coalesce(i.product_name,'') and coalesce(x->>'option_text','')=coalesce(i.option_text,'') limit 1) meta on true
 cross join lateral (select greatest(1,coalesce(nullif(l.component_count_override,0),nullif(i.component_count,0),nullif(meta.n,0),nullif(s.component_count,0),1)) n) c
 where m.group_id=p_group_id and o.order_status='입고완료' and not exists(select 1 from public.sale_inventory_exclusions e where e.purchase_item_id=i.id) and not exists(select 1 from public.sale_random_box_members r where r.purchase_item_id=i.id)
 order by o.ordered_at nulls last,i.id;
$$;

-- Preserve original routine for legacy targets. The wrapper stores group allocations
-- on the logical link, allowing exact restoration even after a group is dissolved.
alter function public.wise_save_inventory_links(text,bigint[],jsonb,text,boolean) rename to wise_save_inventory_links_legacy;
create function public.wise_save_inventory_links(p_action text,p_ids bigint[],p_targets jsonb,p_mode text default 'future',p_remember boolean default false)
returns jsonb language plpgsql set search_path='' as $$
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
     if need>0 then raise exception '묶음 잔여재고가 부족해. (부족 %개)',need;end if;
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
end; $$;
-- Acquire the same lock before sale-row locks to keep auto-sync and manual saves ordered.
create or replace function public.wise_auto_match_inventory(p_ids bigint[])
returns jsonb language plpgsql set search_path='' as $$
declare v_row record; v_done integer:=0; v_skipped integer:=0;
begin
 perform pg_advisory_xact_lock(74190119);
 for v_row in select s.wise_stock_id,r.targets from public.domestic_wise_item_photo s join public.wise_inventory_match_rules r on r.fingerprint=public.wise_inventory_fingerprint(s.item_name,s.image_url,s.item_price) where s.wise_stock_id=any(p_ids) and s.sold_at>=r.enabled_at and not exists(select 1 from public.wise_sale_inventory_links l where l.wise_stock_id=s.wise_stock_id) and not exists(select 1 from public.wise_inventory_auto_exclusions e where e.wise_stock_id=s.wise_stock_id) order by s.sold_at,s.wise_stock_id loop
   begin
     perform 1 from public.domestic_wise_item_photo where wise_stock_id=v_row.wise_stock_id for update;
     if exists(select 1 from public.wise_sale_inventory_links where wise_stock_id=v_row.wise_stock_id) or exists(select 1 from public.wise_inventory_auto_exclusions where wise_stock_id=v_row.wise_stock_id) then continue;end if;
     perform public.wise_save_inventory_links('link',array[v_row.wise_stock_id],v_row.targets,'future',false);
     v_done:=v_done+1;
   exception when others then v_skipped:=v_skipped+1;end;
 end loop;
 return jsonb_build_object('matched',v_done,'skipped',v_skipped);
end; $$;
-- Preserve group revenue as one logical product; retain legacy lot statistics.
create or replace function public.wise_inventory_actual_sales()
returns table(target_id uuid,target_type text,sold_units bigint,revenue numeric,average_price numeric)
language sql stable set search_path='' as $$
 with single_sales as (select wise_stock_id from public.wise_sale_inventory_links group by wise_stock_id having count(*)=1)
 select coalesce(l.purchase_item_id,l.random_box_id,l.inventory_group_id),case when l.purchase_item_id is not null then 'purchase_item' when l.random_box_id is not null then 'random_box' else 'inventory_group' end,
 sum(l.quantity)::bigint,sum(s.item_price),sum(s.item_price)/nullif(sum(l.quantity),0)
 from public.wise_sale_inventory_links l join single_sales x on x.wise_stock_id=l.wise_stock_id join public.domestic_wise_item_photo s on s.wise_stock_id=l.wise_stock_id group by 1,2;
$$;
revoke all on function public.manage_sale_inventory_group(text,uuid,text,uuid[]),public.sale_inventory_group_lots(uuid),public.wise_save_inventory_links(text,bigint[],jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_sale_inventory_group(text,uuid,text,uuid[]),public.sale_inventory_group_lots(uuid),public.wise_save_inventory_links(text,bigint[],jsonb,text,boolean) to service_role;
