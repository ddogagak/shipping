import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.purchase_orders(id uuid primary key,currency text,source_site text,order_status text,raw_data jsonb);
create table public.inventory_items(id uuid primary key,component_count integer);
create table public.purchase_items(id uuid primary key,purchase_order_id uuid,product_name text,option_text text,component_count integer,quantity integer,received_quantity integer,sourcing_inventory_id uuid);
create table public.purchase_sale_inventory(purchase_item_id uuid primary key,component_count_override integer,box_quantity_override integer,remaining_quantity integer,sold_quantity integer,stock_status text,sold_out_at timestamptz,updated_at timestamptz default now());
create table public.sale_random_boxes(id uuid primary key,component_count integer,purchase_quantity integer,view_status text,updated_at timestamptz default now());
create table public.sale_random_box_members(purchase_item_id uuid,random_box_id uuid);
create table public.sale_inventory_exclusions(purchase_item_id uuid primary key);
create table public.domestic_wise_item_photo(wise_stock_id bigint primary key,item_name text,image_url text,item_price numeric,sold_at timestamptz);
create table public.wise_sale_inventory_links(id bigserial primary key,wise_stock_id bigint,purchase_item_id uuid,random_box_id uuid,quantity integer,updated_at timestamptz default now());
insert into purchase_orders values('00000000-0000-0000-0000-000000000001','JPY','JapanProxy','입고완료','{}');
insert into purchase_items values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','card','',10,1,1,null),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','old card','',10,1,1,null);
insert into purchase_sale_inventory(purchase_item_id,remaining_quantity,sold_quantity,stock_status) values('00000000-0000-0000-0000-000000000011',1,0,'active'),('00000000-0000-0000-0000-000000000012',0,1,'soldout');
insert into sale_random_boxes(id,component_count,purchase_quantity,view_status) values('00000000-0000-0000-0000-000000000021',10,1,'display');
insert into domestic_wise_item_photo values (1,'card #1','https://example.com/a.png',5000,now()-interval '1 day');
insert into wise_sale_inventory_links(wise_stock_id,purchase_item_id,quantity) values(1,'00000000-0000-0000-0000-000000000012',1);
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261119_wise_inventory_unit_tracking.sql',import.meta.url),'utf8'));
const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
const id='00000000-0000-0000-0000-000000000011', old='00000000-0000-0000-0000-000000000012',box='00000000-0000-0000-0000-000000000021';
const target=(id,quantity,type='purchase_item')=>[{target_type:type,target_id:id,quantity}];
async function save(action,ids,targets,mode='future',remember=false){return (await one('select wise_save_inventory_links($1,$2::bigint[],$3::jsonb,$4,$5) result',[action,ids,JSON.stringify(targets),mode,remember])).result;}
async function rem(id){return Number((await one('select remaining_units from purchase_sale_inventory where purchase_item_id=$1',[id])).remaining_units);}
assert.equal((await one('select applied_units from wise_sale_inventory_links where wise_stock_id=1')).applied_units,0);
assert.equal((await one('select remaining_units from purchase_sale_inventory where purchase_item_id=$1',[old])).remaining_units,null);
await db.exec(`insert into domestic_wise_item_photo values (2,'card #2','https://example.com/a.png',5000,now()+interval '1 minute'),(3,'card #3','https://example.com/a.png',5000,now()+interval '2 minutes'),(4,'box #1','https://example.com/b.png',5000,now()+interval '3 minutes'),(5,'card #4','https://example.com/a.png',5000,now()+interval '4 minutes');`);
let result=await save('link',[2],target(id,5),'future',true); assert.equal(result.deducted_units,5);assert.equal(await rem(id),5);
result=await save('link',[2],target(id,5));assert.equal(result.deducted_units,0);assert.equal(await rem(id),5);
result=await save('link',[2],target(id,3));assert.equal(result.deducted_units,-2);assert.equal(await rem(id),7);
result=await save('unlink',[2],target(id,1));assert.equal(result.deducted_units,-3);assert.equal(await rem(id),10);
assert.equal((await one('select wise_auto_match_inventory(array[2]::bigint[]) result')).result.matched,0);
assert.equal((await one('select wise_auto_match_inventory(array[3]::bigint[]) result')).result.matched,1);assert.equal(await rem(id),5);
assert.equal((await one('select wise_auto_match_inventory(array[3]::bigint[]) result')).result.matched,0);assert.equal(await rem(id),5);
await assert.rejects(save('link',[5],target(id,6)));assert.equal(await rem(id),5);
assert.equal((await one('select count(*) n from wise_sale_inventory_links where wise_stock_id=5')).n,0);
assert.equal((await save('link',[4],target(box,5,'random_box'))).deducted_units,5);
assert.equal(Number((await one('select remaining_units from sale_random_boxes where id=$1',[box])).remaining_units),5);
assert.equal((await save('link',[1],target(old,1))).deducted_units,0);
assert.equal((await one('select remaining_units from purchase_sale_inventory where purchase_item_id=$1',[old])).remaining_units,null);
assert.equal(Number((await one('select average_price from wise_inventory_actual_sales() where target_id=$1',[id])).average_price),1000);
console.log('PASS: historical preservation; 10→5 units; replay idempotence; edit/undo; exclusion; exact remembered match; insufficient stock rollback; random pool; actual price.');
await db.close();
