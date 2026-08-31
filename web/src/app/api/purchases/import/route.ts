import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseTaobaoWorkbook } from "@/lib/purchases/taobao";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime="nodejs";

function isClosedOrder(sourceStatus:unknown){
  return String(sourceStatus||"").trim()==="交易关闭";
}

export async function POST(req:Request){
  try{
    const form=await req.formData();
    const file=form.get("file");
    const mode=String(form.get("mode")||"preview");
    if(!(file instanceof File))return NextResponse.json({ok:false,message:"엑셀 파일이 없어."},{status:400});

    const parsedOrders=parseTaobaoWorkbook(await file.arrayBuffer());
    const skippedClosed=parsedOrders.filter(o=>isClosedOrder(o.source_status)).length;
    const orders=parsedOrders.filter(o=>!isClosedOrder(o.source_status));
    if(mode==="preview")return NextResponse.json({ok:true,orders,skippedClosed});

    const sb=createServiceRoleClient();
    const{data:sourcingRows,error:sourcingError}=await sb.from("inventory_items").select("id,source_url,source_product_id,internal_sku");
    if(sourcingError)throw sourcingError;

    const byProductId=new Map<string,any[]>();
    for(const row of sourcingRows??[]){
      const productId=String(row.source_product_id||"").trim()||extractSourceProductId(row.source_url)||"";
      if(!productId)continue;
      const rows=byProductId.get(productId)||[];
      rows.push(row);
      byProductId.set(productId,rows);
    }

    let saved=0;
    let updated=0;
    let created=0;

    for(const o of orders){
      const{data:existingOrder,error:existingError}=await sb
        .from("purchase_orders")
        .select("id")
        .eq("source_site",o.source_site)
        .eq("order_number",o.order_number)
        .maybeSingle();
      if(existingError)throw existingError;

      if(existingOrder){
        const{error:updateError}=await sb
          .from("purchase_orders")
          .update({tracking_company:o.tracking_company,tracking_number:o.tracking_number})
          .eq("id",existingOrder.id);
        if(updateError)throw updateError;
        updated++;
        saved++;
        continue;
      }

      const{data:order,error}=await sb.from("purchase_orders").insert({
        country:"CN",source_site:o.source_site,order_number:o.order_number,ordered_at:o.ordered_at,
        shop_name:o.shop_name,paid_amount:o.paid_amount,local_shipping:o.local_shipping,currency:"CNY",
        tracking_company:o.tracking_company,tracking_number:o.tracking_number,raw_data:{source_status:o.source_status},
      }).select("id").single();
      if(error)throw error;

      if(o.items.length){
        const rows=o.items.map(i=>{
          const productId=extractSourceProductId(i.product_url)||"";
          const candidates=productId?byProductId.get(productId)||[]:[];
          const sourcing=candidates.length===1?candidates[0]:null;
          return{...i,purchase_order_id:order.id,source_product_id:productId||null,sourcing_inventory_id:sourcing?.id||null,internal_sku:sourcing?.internal_sku||null};
        });
        const{error:itemError}=await sb.from("purchase_items").insert(rows);
        if(itemError)throw itemError;
      }
      created++;
      saved++;
    }

    return NextResponse.json({ok:true,saved,created,updated,skippedClosed});
  }catch(e){
    return NextResponse.json({ok:false,message:e instanceof Error?e.message:"저장 실패"},{status:500});
  }
}
