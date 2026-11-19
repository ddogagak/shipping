-- Nullable unit balances preserve every legacy box count at rollout. Existing
-- Wise links remain informational (applied_units=0) and are never replayed.
alter table public.purchase_sale_inventory add column if not exists remaining_units bigint check (remaining_units >= 0);
alter table public.sale_random_boxes add column if not exists remaining_units bigint check (remaining_units >= 0);
alter table public.purchase_sale_inventory add column if not exists actual_sale_price_override numeric check (actual_sale_price_override >= 0);
alter table public.sale_random_boxes add column if not exists actual_sale_price_override numeric check (actual_sale_price_override >= 0);
alter table public.wise_sale_inventory_links add column if not exists applied_units integer not null default 0 check (applied_units >= 0);

create table if not exists public.wise_inventory_automation_settings (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null default now()
);
insert into public.wise_inventory_automation_settings(singleton) values (true) on conflict do nothing;
alter table public.wise_inventory_automation_settings enable row level security;

create table if not exists public.wise_inventory_match_rules (
  fingerprint text primary key,
  targets jsonb not null check (jsonb_typeof(targets) = 'array'),
  enabled_at timestamptz not null default now()
);
create table if not exists public.wise_inventory_auto_exclusions (
  wise_stock_id bigint primary key references public.domestic_wise_item_photo(wise_stock_id) on delete cascade
);
alter table public.wise_inventory_match_rules enable row level security;
alter table public.wise_inventory_auto_exclusions enable row level security;
revoke all on public.wise_inventory_automation_settings, public.wise_inventory_match_rules, public.wise_inventory_auto_exclusions from anon, authenticated;
grant select, insert, update, delete on public.wise_inventory_automation_settings, public.wise_inventory_match_rules, public.wise_inventory_auto_exclusions to service_role;

-- Do not infer identity from a name, price, or an absent image alone.
create or replace function public.wise_inventory_fingerprint(p_name text,p_image text,p_price numeric)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(trim(p_image),'') is null or nullif(trim(p_name),'') is null or p_price is null then null
    else md5(regexp_replace(lower(regexp_replace(regexp_replace(trim(p_name),'^#[[:space:]]*[0-9]+[[:space:]]*','','i'),'[[:space:]]*#[[:space:]]*[0-9]+$','','i')),'[[:space:]]+','','g')
      ||'|'||regexp_replace(trim(p_image),'#.*$','')||'|'||p_price::numeric::text) end;
$$;

-- Positive delta sells units, negative delta restores only previously applied units.
-- Row locks serialize concurrent adjustments. Random-box packs are their own
-- pool: the unidentified member actually sold is never guessed.
create or replace function public.wise_adjust_inventory_units(p_type text,p_id uuid,p_delta integer)
returns void language plpgsql set search_path = '' as $$
declare
  v_item record; v_ledger public.purchase_sale_inventory%rowtype;
  v_box public.sale_random_boxes%rowtype; v_count integer; v_boxes bigint;
  v_capacity bigint; v_remaining bigint; v_next bigint; v_meta_count integer;
begin
  if p_delta = 0 then return; end if;
  if p_type='purchase_item' then
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
$$;

-- One transaction for the entire selection. Existing applied quantity is a
-- delta, not a second sale. A historical connection is informational by default.
create or replace function public.wise_save_inventory_links(p_action text,p_ids bigint[],p_targets jsonb,p_mode text default 'future',p_remember boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
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
      if v_next<>v_previous then perform public.wise_adjust_inventory_units(v_target.target_type,v_target.target_id,v_next-v_previous); end if;
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
$$;

-- Auto matching is opt-in per exact observed identity. Never replay an existing
-- link, and never apply sales older than the rule itself. Insufficient inventory
-- stays unmatched so the operator can choose the correct replacement lot.
create or replace function public.wise_auto_match_inventory(p_ids bigint[])
returns jsonb language plpgsql set search_path = '' as $$
declare v_row record; v_done integer:=0; v_skipped integer:=0;
begin
  for v_row in select s.wise_stock_id,r.targets from public.domestic_wise_item_photo s join public.wise_inventory_match_rules r on r.fingerprint=public.wise_inventory_fingerprint(s.item_name,s.image_url,s.item_price) where s.wise_stock_id=any(p_ids) and s.sold_at>=r.enabled_at and not exists(select 1 from public.wise_sale_inventory_links l where l.wise_stock_id=s.wise_stock_id) and not exists(select 1 from public.wise_inventory_auto_exclusions e where e.wise_stock_id=s.wise_stock_id) order by s.wise_stock_id loop
    begin
      perform 1 from public.domestic_wise_item_photo where wise_stock_id=v_row.wise_stock_id for update;
      if exists(select 1 from public.wise_sale_inventory_links where wise_stock_id=v_row.wise_stock_id) or exists(select 1 from public.wise_inventory_auto_exclusions where wise_stock_id=v_row.wise_stock_id) then continue; end if;
      perform public.wise_save_inventory_links('link',array[v_row.wise_stock_id],v_row.targets,'future',false);
      v_done:=v_done+1;
    exception when others then v_skipped:=v_skipped+1; end;
  end loop;
  return jsonb_build_object('matched',v_done,'skipped',v_skipped);
end;
$$;

-- Actual unit price is quantity-weighted. Do not assign the entire revenue of
-- a multi-target bundle to every constituent; those prices remain unknown.
create or replace function public.wise_inventory_actual_sales()
returns table(target_id uuid,target_type text,sold_units bigint,revenue numeric,average_price numeric)
language sql stable set search_path = '' as $$
  with single_sales as (select wise_stock_id from public.wise_sale_inventory_links group by wise_stock_id having count(*)=1)
  select coalesce(l.purchase_item_id,l.random_box_id),case when l.purchase_item_id is not null then 'purchase_item' else 'random_box' end,
    sum(l.quantity)::bigint,sum(s.item_price),sum(s.item_price)/nullif(sum(l.quantity),0)
  from public.wise_sale_inventory_links l join single_sales x on x.wise_stock_id=l.wise_stock_id
  join public.domestic_wise_item_photo s on s.wise_stock_id=l.wise_stock_id
  group by 1,2;
$$;

-- Service-role-only functions; keep RLS and existing client grants unchanged.
revoke all on function public.wise_inventory_fingerprint(text,text,numeric),public.wise_adjust_inventory_units(text,uuid,integer),public.wise_save_inventory_links(text,bigint[],jsonb,text,boolean),public.wise_auto_match_inventory(bigint[]),public.wise_inventory_actual_sales() from public,anon,authenticated;
grant execute on function public.wise_inventory_fingerprint(text,text,numeric),public.wise_adjust_inventory_units(text,uuid,integer),public.wise_save_inventory_links(text,bigint[],jsonb,text,boolean),public.wise_auto_match_inventory(bigint[]),public.wise_inventory_actual_sales() to service_role;
comment on column public.wise_sale_inventory_links.applied_units is 'Units actually deducted by post-rollout matching; zero for legacy informational links.';
