-- Backfill stable management SKUs for existing sourcing inventory.
-- Rule: blank option_seq means the source product is not duplicated, so treat it as option 00.
-- For duplicated source products, the manually entered option_seq is preserved.

with parsed as (
  select
    id,
    case
      when lower(coalesce(source_url, '')) like '%taobao.com%' then 'TB'
      when lower(coalesce(source_url, '')) like '%tmall.com%' then 'TM'
      when lower(coalesce(source_url, '')) like '%1688.com%' then 'A8'
      when lower(coalesce(source_url, '')) like '%amiami.%' then 'AA'
      when lower(coalesce(source_url, '')) like '%animate%' then 'AN'
      when lower(coalesce(source_url, '')) like '%suruga-ya%' or lower(coalesce(source_url, '')) like '%surugaya%' then 'SG'
      when lower(coalesce(source_url, '')) like '%jumpcs%' then 'JC'
      when lower(coalesce(source_url, '')) like '%ensky%' then 'ES'
      when lower(coalesce(source_url, '')) like '%amnibus%' then 'AM'
      when lower(coalesce(source_url, '')) like '%maxlimited%' then 'ML'
      when lower(coalesce(source_url, '')) like '%pochimart%' then 'PM'
      when lower(coalesce(source_url, '')) like '%hobbystock%' then 'HS'
      when lower(coalesce(source_url, '')) like '%metal-box%' then 'MB'
      when lower(coalesce(source_url, '')) like '%colleize%' then 'CL'
      when lower(coalesce(source_url, '')) like '%syokugan-ohkoku%' then 'SO'
      when lower(coalesce(source_url, '')) like '%mile-stone%' then 'MS'
      when lower(coalesce(source_url, '')) like '%mercari%' then 'MC'
      when lower(coalesce(source_url, '')) like '%amazon.co.jp%' then 'AZ'
      else 'ETC'
    end as site_code,
    case coalesce(series_name, '기타')
      when '나루토' then 'NAR'
      when '헌터헌터' then 'HXH'
      when '귀멸의칼날' then 'KNY'
      when '나의히어로아카데미아' then 'MHA'
      when '프리렌' then 'FRN'
      when '진격의거인' then 'AOT'
      when '치이카와' then 'CHI'
      else 'ETC'
    end as series_code,
    coalesce(
      substring(source_url from '(?i)[?&]gcode=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]scode=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]id=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]itemId=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]item_id=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]offerId=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]offer_id=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]goodsId=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)[?&]goods_id=([A-Za-z0-9_-]+)'),
      substring(source_url from '(?i)/offer/([0-9]+)\\.html'),
      substring(source_url from '(?i)/item/([0-9]+)(?:\\.html)?'),
      substring(source_url from '(?i)/([0-9]{6,})(?:\\.html)?(?:[?#]|$)')
    ) as product_id,
    coalesce(option_seq, 0) as resolved_option_seq
  from public.inventory_items
), ready as (
  select
    id,
    site_code,
    series_code,
    product_id,
    resolved_option_seq,
    site_code || '-' || series_code || '-' || regexp_replace(product_id, '[^A-Za-z0-9]', '', 'g') || '-' || lpad(resolved_option_seq::text, 2, '0') as sku
  from parsed
  where product_id is not null
    and resolved_option_seq >= 0
)
update public.inventory_items i
set
  source_site_code = r.site_code,
  source_product_id = r.product_id,
  option_seq = r.resolved_option_seq,
  internal_sku = r.sku
from ready r
where i.id = r.id
  and i.internal_sku is null;
