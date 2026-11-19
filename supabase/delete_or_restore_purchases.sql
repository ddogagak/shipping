-- Deleting a converted purchase cancels its registration, not the payment record.
create or replace function public.delete_or_restore_purchases(p_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.purchase_orders%rowtype;
  snapshot jsonb;
  original_no text;
  restored integer := 0;
  deleted integer := 0;
begin
  if coalesce(cardinality(p_ids),0) = 0 then
    raise exception '삭제할 주문을 선택해줘.';
  end if;
  perform id from public.purchase_orders where id = any(p_ids) order by id for update;
  for entry in select * from public.purchase_orders where id = any(p_ids) order by id loop
    if entry.raw_data->'simple_purchase' = 'true'::jsonb or entry.raw_data ? 'simple_merged_into' then
      raise exception '간이 매입은 간이 매입관리에서 처리해줘.';
    elsif entry.raw_data->'converted_from_simple' = 'true'::jsonb then
      -- A partial receipt carries the same original invoice on multiple orders.
      -- Do not restore the whole invoice while any split portion still exists.
      if entry.raw_data ? 'split_from_order_id' or exists (
        select 1 from public.purchase_orders p where p.id <> entry.id and
          (p.raw_data->>'split_from_order_id' = entry.id::text or
           (p.raw_data->'converted_from_simple' = 'true'::jsonb and
            p.raw_data->>'previous_simple_order_number' = entry.raw_data->>'previous_simple_order_number'))
      ) then
        raise exception '부분입고로 분리된 간이 매입은 원본 금액 중복 방지를 위해 별도 확인이 필요해.';
      end if;
      if exists (select 1 from public.wise_sale_inventory_links l join public.purchase_items i on i.id=l.purchase_item_id where i.purchase_order_id=entry.id)
        or exists (select 1 from public.purchase_sale_inventory s join public.purchase_items i on i.id=s.purchase_item_id where i.purchase_order_id=entry.id and coalesce(s.sold_quantity,0)>0) then
        raise exception '판매 이력에 연결된 매입은 판매 연결을 먼저 확인해줘.';
      end if;
      snapshot := entry.raw_data->'previous_simple_snapshot';
      original_no := coalesce(nullif(entry.raw_data->>'previous_simple_order_number',''),'SIMPLE-'||entry.id::text);
      delete from public.purchase_items where purchase_order_id=entry.id;
      update public.purchase_orders set
        country='KR', source_site='간이', order_number=original_no,
        shop_name=case when snapshot ? 'shop_name' then snapshot->>'shop_name' else entry.shop_name end,
        ordered_at=coalesce((snapshot->>'ordered_at')::timestamptz,entry.ordered_at),
        paid_amount=coalesce((snapshot->>'paid_amount')::numeric,entry.paid_amount),
        local_shipping=coalesce((snapshot->>'local_shipping')::numeric,entry.local_shipping,0),
        memo=case when snapshot ? 'memo' then snapshot->>'memo' else entry.memo end,
        currency='KRW', order_status='입고완료', tracking_company=null, tracking_number=null,
        raw_data=(entry.raw_data - array['converted_from_simple','converted_at','previous_simple_order_number','previous_simple_snapshot','source_status','text_import_type','domestic_items','first_payment','second_payment_confirmed'])
          || jsonb_build_object('simple_purchase',true,'purchase_registered',false,'invoice_total_confirmed',true,'payment_currency','KRW'),
        updated_at=now()
      where id=entry.id;
      restored := restored+1;
    else
      delete from public.purchase_orders where id=entry.id;
      deleted := deleted+1;
    end if;
  end loop;
  return jsonb_build_object('deleted',deleted,'restored',restored);
end;
$$;
revoke all on function public.delete_or_restore_purchases(uuid[]) from public, anon, authenticated;
grant execute on function public.delete_or_restore_purchases(uuid[]) to service_role;
