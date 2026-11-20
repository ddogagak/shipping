-- Manual quantity metadata; the original Wise price and imported sale are unchanged.
alter table public.domestic_wise_item_photo
  add column if not exists actual_sale_units integer check (actual_sale_units between 1 and 9999);

-- Keep the sale quantity when the inventory relationship is later removed.
-- Link inserts/updates are explicit per-target allocations; unlink never
-- changes a previously recorded actual-sale quantity.
create or replace function public.wise_preserve_sale_units()
returns trigger language plpgsql set search_path='' as $$
declare sid bigint; units bigint;
begin
  sid:=case when tg_op='DELETE' then old.wise_stock_id else new.wise_stock_id end;
  select coalesce(sum(quantity),0) into units from public.wise_sale_inventory_links where wise_stock_id=sid;
  if tg_op='DELETE' then
    update public.domestic_wise_item_photo set actual_sale_units=least(units+old.quantity,9999)::integer
      where wise_stock_id=sid and actual_sale_units is null;
    return old;
  end if;
  if units>9999 then raise exception '판매 1건당 연결 수량은 최대 9999개야.'; end if;
  update public.domestic_wise_item_photo set actual_sale_units=units::integer where wise_stock_id=sid;
  return new;
end; $$;
revoke all on function public.wise_preserve_sale_units() from public,anon,authenticated;
create trigger wise_preserve_sale_units_trigger after insert or update of quantity or delete on public.wise_sale_inventory_links
for each row execute function public.wise_preserve_sale_units();

-- Existing linked quantities remain authoritative. Only unlinked sales use the
-- manual override (or 1). Update links and their already-applied stock delta
-- atomically, preserving link-only historical sales.
create or replace function public.wise_set_sale_units(p_ids bigint[], p_units integer)
returns jsonb language plpgsql set search_path='' as $$
declare sid bigint; l public.wise_sale_inventory_links%rowtype;
  n integer; linked_units integer; result jsonb; delta integer:=0; saved integer:=0;
begin
  if p_units is null or p_units not between 1 and 9999 or coalesce(cardinality(p_ids),0) not between 1 and 300 then
    raise exception '판매 수량 또는 선택 건수를 확인해줘.';
  end if;
  perform pg_advisory_xact_lock(74190119);
  for sid in select distinct x from unnest(p_ids) x order by x loop
    perform 1 from public.domestic_wise_item_photo where wise_stock_id=sid for update;
    if not found then raise exception '판매기록을 찾지 못했어.'; end if;
    select count(*),coalesce(sum(quantity),0) into n,linked_units from public.wise_sale_inventory_links where wise_stock_id=sid;
    if n>1 and linked_units<>p_units then
      raise exception '여러 재고가 연결된 판매는 연결 화면에서 각 재고별 수량을 수정해줘.';
    end if;
    if n=1 and linked_units<>p_units then
      select * into l from public.wise_sale_inventory_links where wise_stock_id=sid for update;
      result:=public.wise_save_inventory_links('link',array[sid],jsonb_build_array(jsonb_build_object(
        'target_type',case when l.inventory_group_id is not null then 'inventory_group' when l.purchase_item_id is not null then 'purchase_item' else 'random_box' end,
        'target_id',coalesce(l.inventory_group_id,l.purchase_item_id,l.random_box_id),'quantity',p_units)),
        case when l.applied_units>0 then 'historical' else 'link_only' end,false);
      delta:=delta+(result->>'deducted_units')::integer;
    end if;
    update public.domestic_wise_item_photo set actual_sale_units=p_units where wise_stock_id=sid;
    saved:=saved+1;
  end loop;
  return jsonb_build_object('count',saved,'deducted_units',delta);
end; $$;
revoke all on function public.wise_set_sale_units(bigint[],integer) from public,anon,authenticated;
grant execute on function public.wise_set_sale_units(bigint[],integer) to service_role;
