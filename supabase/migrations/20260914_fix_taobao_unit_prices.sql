-- Repair Taobao rows imported before the unit-price parsing fix.
-- Only financial fields are changed; item ids/status/sourcing/display fields are preserved.

-- Order 3316997100058014282 / CHIIKAWA x Sanrio full box x2
update public.purchase_items pi
set
  unit_price = 465.30,
  line_total = 930.60
from public.purchase_orders po
where pi.purchase_order_id = po.id
  and po.source_site = 'Taobao'
  and po.order_number = '3316997100058014282'
  and pi.quantity = 2
  and pi.option_text = '端盒9款【全新不重复未拆封】'
  and pi.product_url like 'https://item.taobao.com/item.htm?id=1056129603797%';

-- Order 3316359111323114665 / rubber keychain box x2
update public.purchase_items pi
set
  unit_price = 120.00,
  line_total = 240.00
from public.purchase_orders po
where pi.purchase_order_id = po.id
  and po.source_site = 'Taobao'
  and po.order_number = '3316359111323114665'
  and pi.quantity = 2
  and pi.option_text = '软胶挂件一盒（7人）'
  and pi.product_url like 'https://item.taobao.com/item.htm?id=1069779164588%';

-- Order 3316366239076014282 / rubber keychain box x2
update public.purchase_items pi
set
  unit_price = 120.00,
  line_total = 240.00
from public.purchase_orders po
where pi.purchase_order_id = po.id
  and po.source_site = 'Taobao'
  and po.order_number = '3316366239076014282'
  and pi.quantity = 2
  and pi.option_text = '软胶挂件一盒（7人）'
  and pi.product_url like 'https://item.taobao.com/item.htm?id=1069779164588%';
