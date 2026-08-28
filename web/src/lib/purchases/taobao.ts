import * as XLSX from "xlsx";

export type TaobaoItem = { product_name:string; option_text:string; product_url:string; quantity:number; unit_price:number; line_total:number };
export type TaobaoOrder = { order_number:string; ordered_at:string|null; source_site:string; shop_name:string; source_status:string; paid_amount:number; local_shipping:number; tracking_company:string; tracking_number:string; items:TaobaoItem[] };

const money=(v:unknown)=>{ const n=Number(String(v??"").replace(/[￥¥,\s]/g,"")); return Number.isFinite(n)?n:0 };
const qty=(v:unknown)=>{ const n=Number(v); return Number.isFinite(n)&&n>0?Math.trunc(n):1 };
export function parseTaobaoWorkbook(buffer:ArrayBuffer):TaobaoOrder[]{
  const wb=XLSX.read(buffer,{type:"array"}); const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:""});
  const orders:TaobaoOrder[]=[]; let current:TaobaoOrder|null=null;
  for(const r of rows){
    const no=String(r["订单号"]??"").trim();
    if(no){ current={order_number:no,ordered_at:String(r["订单提交时间"]??"").trim()||null,source_site:"Taobao",shop_name:String(r["店铺名称"]??""),source_status:String(r["订单状态"]??""),paid_amount:money(r["实付金额"]),local_shipping:money(r["运费"]),tracking_company:String(r["物流公司（当前仅支持未完结订单）"]??""),tracking_number:String(r["物流单号（当前仅支持未完结订单）"]??""),items:[]}; orders.push(current); }
    if(!current) continue;
    const name=String(r["商品名称"]??"").trim(); if(!name) continue;
    const q=qty(r["商品数量"]), total=money(r["商品金额"]);
    current.items.push({product_name:name,option_text:String(r["型号款式"]??""),product_url:String(r["商品链接"]??""),quantity:q,unit_price:q?total/q:total,line_total:total});
  }
  return orders;
}
