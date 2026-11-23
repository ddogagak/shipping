
-- Actual-sale links must never reserve more units than their source stock.
-- Existing overmatched rows are preserved; removing/reducing them stays allowed.
CREATE OR REPLACE FUNCTION public.wise_link_inventory_capacity(p_type text, p_id uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $fn$
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
    SELECT greatest(0,coalesce(b.purchase_quantity,0))::bigint
      * greatest(1,coalesce(b.component_count,1))::bigint
      INTO v_capacity FROM public.sale_random_boxes b WHERE b.id=p_id;
  ELSIF p_type = 'inventory_group' THEN
    SELECT sum(public.wise_link_inventory_capacity('purchase_item',m.purchase_item_id))
      INTO v_capacity FROM public.sale_inventory_group_members m WHERE m.group_id=p_id;
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_capacity;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.wise_check_link_quantity_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
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
    SELECT coalesce(sum(l.quantity),0) INTO v_current
      FROM public.wise_sale_inventory_links l
      WHERE l.random_box_id=NEW.random_box_id AND l.id IS DISTINCT FROM NEW.id;
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
$fn$;

DROP TRIGGER IF EXISTS wise_check_link_quantity_cap_trg ON public.wise_sale_inventory_links;
CREATE TRIGGER wise_check_link_quantity_cap_trg
BEFORE INSERT OR UPDATE OF quantity,purchase_item_id,random_box_id,inventory_group_id
ON public.wise_sale_inventory_links
FOR EACH ROW EXECUTE FUNCTION public.wise_check_link_quantity_cap();

CREATE OR REPLACE FUNCTION public.wise_list_overmatched_inventory()
RETURNS TABLE(target_type text,target_id uuid,item_name text,capacity bigint,matched bigint,excess bigint)
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
WITH direct_totals AS (
  SELECT l.purchase_item_id AS id,sum(l.quantity)::bigint AS used
  FROM public.wise_sale_inventory_links l WHERE l.purchase_item_id IS NOT NULL
  GROUP BY l.purchase_item_id
), box_totals AS (
  SELECT l.random_box_id AS id,sum(l.quantity)::bigint AS used
  FROM public.wise_sale_inventory_links l WHERE l.random_box_id IS NOT NULL
  GROUP BY l.random_box_id
), group_totals AS (
  SELECT l.inventory_group_id AS id,sum(l.quantity)::bigint AS used
  FROM public.wise_sale_inventory_links l WHERE l.inventory_group_id IS NOT NULL
  GROUP BY l.inventory_group_id
), all_results AS (
  SELECT 'purchase_item'::text AS target_type, pi.id AS target_id,
    coalesce(nullif(pl.display_name,''),nullif(pi.display_name_ko,''),pi.product_name) AS item_name,
    public.wise_link_inventory_capacity('purchase_item',pi.id) AS capacity,
    d.used AS matched
  FROM direct_totals d JOIN public.purchase_items pi ON pi.id=d.id
    LEFT JOIN public.purchase_sale_inventory pl ON pl.purchase_item_id=pi.id
  UNION ALL
  SELECT 'random_box'::text,b.id,b.title,
    public.wise_link_inventory_capacity('random_box',b.id),d.used
  FROM box_totals d JOIN public.sale_random_boxes b ON b.id=d.id
  UNION ALL
  SELECT 'inventory_group'::text,g.id,g.title,
    public.wise_link_inventory_capacity('inventory_group',g.id),
    d.used+coalesce((
      SELECT sum(l.quantity) FROM public.wise_sale_inventory_links l
      JOIN public.sale_inventory_group_members gm ON gm.purchase_item_id=l.purchase_item_id
      WHERE gm.group_id=g.id
    ),0)
  FROM group_totals d JOIN public.sale_inventory_groups g ON g.id=d.id
)
SELECT x.target_type,x.target_id,x.item_name,x.capacity,x.matched,
       x.matched-x.capacity AS excess
FROM all_results x
WHERE x.capacity IS NOT NULL AND x.matched>x.capacity
ORDER BY (x.matched-x.capacity) DESC,x.item_name;
$fn$;

REVOKE ALL ON FUNCTION public.wise_link_inventory_capacity(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wise_list_overmatched_inventory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wise_link_inventory_capacity(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wise_list_overmatched_inventory() TO service_role;
