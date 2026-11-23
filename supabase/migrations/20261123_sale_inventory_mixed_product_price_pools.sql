
ALTER TABLE public.sale_inventory_groups
  ADD COLUMN IF NOT EXISTS group_kind text NOT NULL DEFAULT 'same_product',
  ADD COLUMN IF NOT EXISTS sale_price numeric;
ALTER TABLE public.sale_inventory_groups
  DROP CONSTRAINT IF EXISTS sale_inventory_groups_group_kind_check;
ALTER TABLE public.sale_inventory_groups
  ADD CONSTRAINT sale_inventory_groups_group_kind_check CHECK (group_kind IN ('same_product','sale_pool'));
ALTER TABLE public.sale_inventory_groups
  DROP CONSTRAINT IF EXISTS sale_inventory_groups_sale_price_check;
ALTER TABLE public.sale_inventory_groups
  ADD CONSTRAINT sale_inventory_groups_sale_price_check CHECK (sale_price IS NULL OR sale_price>=0);

CREATE OR REPLACE FUNCTION public.create_sale_inventory_pool(p_title text,p_sale_price numeric,p_member_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_group uuid;
BEGIN
  IF trim(coalesce(p_title,''))='' OR length(p_title)>200
     OR p_sale_price IS NULL OR p_sale_price<0
     OR p_sale_price<>trunc(p_sale_price)
     OR cardinality(p_member_ids)<2 OR cardinality(p_member_ids)>100
  THEN RAISE EXCEPTION '재고풀 이름, 판매가격, 선택 상품(2~100개)을 확인해줘.'; END IF;
  v_group:=public.manage_sale_inventory_group('create',NULL,p_title,p_member_ids);
  UPDATE public.sale_inventory_groups SET group_kind='sale_pool',sale_price=p_sale_price WHERE id=v_group;
  RETURN v_group;
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_sale_inventory_pool(text,numeric,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_inventory_pool(text,numeric,uuid[]) TO service_role;
