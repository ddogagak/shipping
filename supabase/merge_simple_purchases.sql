-- Atomic, service-role-only merge. Original rows are retained as hidden history.
create or replace function public.merge_simple_purchases(p_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.purchase_orders%rowtype;
  target public.purchase_orders%rowtype;
  n integer;
  v_total numeric := 0;
  v_shipping numeric := 0;
  v_check boolean := false;
  v_payments jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_memo text := '';
begin
  select count(distinct id) into n from unnest(p_ids) as t(id);
  if n < 2 or n <> cardinality(p_ids) or n > 100 then
    raise exception '간이 매입을 2~100건 선택해줘.';
  end if;
  -- Lock in a deterministic order before inspecting or changing any record.
  perform id from public.purchase_orders where id = any(p_ids) order by id for update;
  if (select count(*) from public.purchase_orders where id = any(p_ids)) <> n then
    raise exception '선택한 간이 내역을 찾을 수 없어.';
  end if;
  select * into target from public.purchase_orders where id = any(p_ids)
    order by ordered_at asc nulls last, id limit 1;
  if nullif(btrim(target.shop_name), '') is null or target.shop_name = '간이 매입' then
    raise exception '거래처를 먼저 입력해줘.';
  end if;
  for entry in select * from public.purchase_orders where id = any(p_ids) order by ordered_at asc nulls last, id loop
    if entry.source_site is distinct from '간이'
       or entry.raw_data->'simple_purchase' is distinct from 'true'::jsonb
       or entry.raw_data->'purchase_registered' = 'true'::jsonb
       or entry.raw_data ? 'simple_merged_into'
       or coalesce(entry.raw_data->>'purchase_category', '매입') <> '매입'
       or btrim(entry.shop_name) is distinct from btrim(target.shop_name)
       or entry.currency is distinct from 'KRW'
       or entry.ordered_at is null or entry.paid_amount is null or entry.paid_amount <= 0 then
      raise exception '같은 거래처의 미등록 원화 간이 매입만 합칠 수 있어.';
    end if;
    if exists (select 1 from public.purchase_items where purchase_order_id = entry.id) then
      raise exception '이미 상품행이 있는 간이 매입은 합칠 수 없어.';
    end if;
    v_total := v_total + entry.paid_amount;
    v_shipping := v_shipping + coalesce(entry.local_shipping, 0);
    v_check := v_check or coalesce(entry.raw_data->'invoice_check_needed' = 'true'::jsonb, false);
    v_payments := v_payments || coalesce(entry.raw_data->'simple_merge_payments', jsonb_build_array(jsonb_build_object(
      'id',entry.id,'ordered_at',entry.ordered_at,'paid_amount',entry.paid_amount,
      'local_shipping',entry.local_shipping,'memo',entry.memo,'order_number',entry.order_number)));
    v_invoices := v_invoices || coalesce(entry.raw_data->'simple_merged_images'->'invoice','[]'::jsonb)
      || case when nullif(entry.raw_data->'simple_images'->>'invoice','') is not null then jsonb_build_array(entry.raw_data->'simple_images'->>'invoice') else '[]'::jsonb end;
    v_receipts := v_receipts || coalesce(entry.raw_data->'simple_merged_images'->'payment','[]'::jsonb)
      || case when nullif(entry.raw_data->'simple_images'->>'payment','') is not null then jsonb_build_array(entry.raw_data->'simple_images'->>'payment') else '[]'::jsonb end;
    v_memo := concat_ws(E'\n',nullif(v_memo,''),format('%s · %s원%s',to_char(entry.ordered_at at time zone 'Asia/Seoul','YYYY-MM-DD'),entry.paid_amount,case when nullif(entry.memo,'') is not null then ' / '||entry.memo else '' end));
  end loop;
  update public.purchase_orders set paid_amount = v_total, local_shipping = v_shipping, memo = v_memo,
    raw_data = target.raw_data || jsonb_build_object('simple_merge_payments',v_payments,
      'simple_merged_images',jsonb_build_object('invoice',v_invoices,'payment',v_receipts),
      'invoice_check_needed',v_check), updated_at = now()
    where id = target.id;
  update public.purchase_files set purchase_order_id = target.id where purchase_order_id = any(p_ids) and purchase_order_id <> target.id;
  update public.purchase_costs set purchase_order_id = target.id where purchase_order_id = any(p_ids) and purchase_order_id <> target.id;
  update public.purchase_orders set raw_data = raw_data || jsonb_build_object('simple_merged_into',target.id,'purchase_registered',true), updated_at = now()
    where id = any(p_ids) and id <> target.id;
  return target.id;
end;
$$;
revoke all on function public.merge_simple_purchases(uuid[]) from public, anon, authenticated;
grant execute on function public.merge_simple_purchases(uuid[]) to service_role;
