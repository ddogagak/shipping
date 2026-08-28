-- 치이카와 / 나루토 다국어 표기를 내부 작품명(한국어)으로 통일
-- 기존 인벤토리 데이터에도 적용되어 인벤토리/카드/매입카드/방송판매재고에서 같은 분류를 사용한다.

update public.inventory_items
set series_name = '치이카와'
where lower(coalesce(series_name, '') || ' ' || coalesce(item_name, '') || ' ' || coalesce(memo, '') || ' ' || coalesce(raw_text, ''))
      ~ '(치이카와|chiikawa|ちいかわ|吉伊卡哇)';

update public.inventory_items
set series_name = '나루토'
where lower(coalesce(series_name, '') || ' ' || coalesce(item_name, '') || ' ' || coalesce(memo, '') || ' ' || coalesce(raw_text, ''))
      ~ '(나루토|naruto|ナルト|火影忍者)';
