alter table public.purchase_items
add column if not exists series_name text;

update public.purchase_items pi
set series_name = '치이카와'
where lower(
  coalesce(pi.series_name, '') || ' ' ||
  coalesce(pi.product_name, '') || ' ' ||
  coalesce(pi.display_name_ko, '') || ' ' ||
  coalesce(pi.option_text, '')
) ~ '(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)';

update public.inventory_items
set series_name = '치이카와'
where lower(
  coalesce(series_name, '') || ' ' ||
  coalesce(item_name, '') || ' ' ||
  coalesce(memo, '') || ' ' ||
  coalesce(raw_text, '')
) ~ '(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)';

update public.sourcing_research
set series_name = '치이카와'
where lower(
  coalesce(series_name, '') || ' ' ||
  coalesce(product_name, '') || ' ' ||
  coalesce(memo, '')
) ~ '(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)';
