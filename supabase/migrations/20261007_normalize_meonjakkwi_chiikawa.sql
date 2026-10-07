-- 먼작귀 표기를 치이카와 작품명으로 정규화한다.
-- 기존 소싱/국내재고 DB를 보정하여 매입관리 연동 화면에서도 동일한 작품명을 사용한다.

update public.inventory_items
set series_name = '치이카와'
where lower(
  coalesce(series_name, '') || ' ' ||
  coalesce(item_name, '') || ' ' ||
  coalesce(memo, '') || ' ' ||
  coalesce(raw_text, '')
) ~ '(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)';
