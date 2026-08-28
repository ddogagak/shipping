import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    const [{ data: orders, error }, { data: sourcingRows, error: sourcingError }, { data: ledgers, error: ledgerError }] = await Promise.all([
      sb.from("purchase_orders").select("id,order_number,ordered_at,shop_name,purchase_items(*)").eq("order_status", "입고완료").order("ordered_at", { ascending: false }),
      sb.from("inventory_items").select("id,item_name,item_type,series_name,image_url,lineup_image_url,source_url,memo"),
      sb.from("purchase_sale_inventory").select("*"),
    ]);
    if (error) throw error;
    if (sourcingError) throw sourcingError;
    if (ledgerError) throw ledgerError;

    const sourcingById = new Map<string, any>();
    const sourcingByProductId = new Map<string, any>();
    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);
      const productId = extractSourceProductId(row.source_url);
      if (productId && !sourcingByProductId.has(productId)) sourcingByProductId.set(productId, row);
    }
    const ledgerByItemId = new Map((ledgers ?? []).map((row:any)=>[String(row.purchase_item_id),row]));

    const items = (orders ?? []).flatMap((order:any)=>(order.purchase_items ?? []).map((item:any)=>{
      const productId = String(item.source_product_id || "") || extractSourceProductId(item.product_url) || "";
      const sourcing = (item.sourcing_inventory_id ? sourcingById.get(String(item.sourcing_inventory_id)) : null) || (productId ? sourcingByProductId.get(productId) : null);
      const ledger:any = ledgerByItemId.get(String(item.id));
      const originalQty = Number(item.received_quantity ?? item.quantity ?? 0);
      return {
        id:item.id, order_id:order.id, order_number:order.order_number, ordered_at:order.ordered_at, shop_name:order.shop_name,
        product_name:item.product_name, display_name:item.display_name_ko || sourcing?.item_name || item.product_name,
        option_text:item.option_text, product_url:item.product_url, purchase_quantity:originalQty, unit_price:item.unit_price,
        image_url:item.image_url || sourcing?.image_url || null, lineup_image_url:sourcing?.lineup_image_url || null,
        series_name:sourcing?.series_name || null, item_type:sourcing?.item_type || null, memo:sourcing?.memo || null,
        sale_price:ledger?.sale_price ?? null,
        remaining_quantity:ledger ? Number(ledger.remaining_quantity || 0) : originalQty,
        sold_quantity:ledger ? Number(ledger.sold_quantity || 0) : 0,
        stock_status:ledger?.stock_status || "active",
        sale_memo:ledger?.sale_memo || "",
        sold_out_at:ledger?.sold_out_at || null,
      };
    }));
    return NextResponse.json({ok:true,items});
  } catch(e) {
    return NextResponse.json({ok:false,message:e instanceof Error?e.message:"판매재고 조회 실패"},{status:500});
  }
}

export async function PATCH(req:Request) {
  try {
    const body=await req.json();
    if(!body.purchase_item_id) return NextResponse.json({ok:false,message:"상품 ID가 없습니다."},{status:400});
    const sb=createServiceRoleClient();
    const remaining=Math.max(0,Math.trunc(Number(body.remaining_quantity ?? 0)));
    const sold=Math.max(0,Math.trunc(Number(body.sold_quantity ?? 0)));
    const status=body.stock_status === "soldout" || remaining === 0 ? "soldout" : "active";
    const payload={
      purchase_item_id:body.purchase_item_id,
      sale_price:body.sale_price === "" || body.sale_price == null ? null : Number(body.sale_price),
      remaining_quantity:remaining,
      sold_quantity:sold,
      stock_status:status,
      sale_memo:String(body.sale_memo || "").trim() || null,
      sold_out_at:status === "soldout" ? (body.sold_out_at || new Date().toISOString()) : null,
    };
    const {data,error}=await sb.from("purchase_sale_inventory").upsert(payload,{onConflict:"purchase_item_id"}).select().single();
    if(error) throw error;
    return NextResponse.json({ok:true,item:data});
  } catch(e) {
    return NextResponse.json({ok:false,message:e instanceof Error?e.message:"판매재고 저장 실패"},{status:500});
  }
}
