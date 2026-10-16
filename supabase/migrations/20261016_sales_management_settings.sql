-- Sales management persistent settings and per-Wise-item controls.
create table if not exists public.sales_management_settings (
  id text primary key default 'main' check (id = 'main'),
  cumulative_settled_amount numeric(14,2) not null default 17232999 check (cumulative_settled_amount >= 0),
  excluded_keywords jsonb not null default '["야생","용자","소장","양도","양고","배송비","배송료","택배비","送料","shipping fee","shipping cost","delivery fee","postage"]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.sales_management_settings (id, cumulative_settled_amount, excluded_keywords)
values (
  'main',
  17232999,
  '["야생","용자","소장","양도","양고","배송비","배송료","택배비","送料","shipping fee","shipping cost","delivery fee","postage"]'::jsonb
)
on conflict (id) do nothing;

create table if not exists public.sales_management_item_setting (
  wise_stock_id bigint primary key
    references public.domestic_wise_item_photo (wise_stock_id) on delete cascade,
  include_cost boolean not null default true,
  memo text not null default '',
  is_deleted boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.sales_management_settings enable row level security;
alter table public.sales_management_item_setting enable row level security;

grant all on table public.sales_management_settings to service_role;
grant all on table public.sales_management_item_setting to service_role;
