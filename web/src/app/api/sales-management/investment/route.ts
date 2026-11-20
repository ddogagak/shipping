import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { GET as getInventory } from "../../sale-inventory/route";
import { GET as getRandomBoxes } from "../../sale-inventory/random-boxes/route";
import { buildInvestmentReport } from "@/lib/inventory-investment";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const DEFAULT_EXCLUDED=["야생","용자","소장","양도","양고","배송비","배송료","택배비","送料","shipping fee","shipping cost","delivery fee","postage"];
async function readAll(sb:ReturnType<typeof createServiceRoleClient>,table:string,columns:string,key:string){
 const result:any[]=[];const size=500;
 for(let offset=0;;offset+=size){const {data,error}=await sb.from(table).select(columns).order(key).range(offset,offset+size-1);if(error)throw error;const rows=data||[];result.push(...rows);if(rows.length<size)break;}
 return result;
}
async function responseData(response:Response){const json=await response.json();if(!response.ok||!json.ok)throw Error(json.message||"재고 조회 실패");return json;}

export async function GET(req:Request){
 try{
  const sb=createServiceRoleClient();
  // Reuse the current inventory's canonical SKU, quantity and override rules.
  // The read_only flag explicitly prevents its repair routine from writing.
  const inventoryRequest=new Request(new URL("/api/sale-inventory?read_only=1",req.url));
  const [inventory,boxes,orders,sales,links,rules,settings,deleted]=await Promise.all([
   getInventory(inventoryRequest).then(responseData),getRandomBoxes().then(responseData),
   readAll(sb,"purchase_orders","id,ordered_at,order_number,shop_name,source_site,order_status,paid_amount,local_shipping,currency,raw_data,purchase_items(id,product_name,display_name_ko,series_name,quantity,component_count)","id"),
   readAll(sb,"domestic_wise_item_photo","wise_stock_id,item_name,item_price,actual_sale_units,sold_at,ordered_at","wise_stock_id"),
   readAll(sb,"wise_sale_inventory_links","id,wise_stock_id,purchase_item_id,random_box_id,inventory_group_id,quantity,group_allocations","id"),
   readAll(sb,"item_analysis_series_keywords","series_name,keywords","series_name"),
   sb.from("sales_management_settings").select("excluded_keywords").eq("id","main").maybeSingle(),
   readAll(sb,"sales_management_item_setting","wise_stock_id,is_deleted","wise_stock_id"),
  ]);
  if(settings.error)throw settings.error;
  const report=buildInvestmentReport({orders,inventory:inventory.items||[],boxes:boxes.items||[],sales:sales.map(s=>({...s,id:String(s.wise_stock_id)})),links,rules,excludedKeywords:Array.isArray(settings.data?.excluded_keywords)?settings.data.excluded_keywords:DEFAULT_EXCLUDED,deletedIds:deleted.filter(s=>s.is_deleted).map(s=>String(s.wise_stock_id)),now:new Date().toISOString()});
  return NextResponse.json({ok:true,...report});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:String((e as any)?.message||"투자성과 데이터 조회 실패")},{status:500});}
}
