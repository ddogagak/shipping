import {NextResponse} from "next/server";
import {createServiceRoleClient} from "@/lib/supabase/server";
export const runtime="nodejs";
const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();
export async function GET(){
 try{
  const sb=createServiceRoleClient();
  const {data,error}=await sb.from("item_analysis_series_overrides").select("item_key,series_name").order("item_key");
  if(error)throw error;
  return NextResponse.json({ok:true,overrides:data||[]});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"수동 분류 조회 실패"},{status:500});}
}
export async function PUT(request:Request){
 try{
  const body=await request.json();
  const item_key=clean(body.item_key);
  const series_name=clean(body.series_name);
  if(!item_key||item_key.length>500||!series_name||series_name.length>80)
   return NextResponse.json({ok:false,message:"상품명 또는 작품명이 올바르지 않아."},{status:400});
  const sb=createServiceRoleClient();
  const {error}=await sb.from("item_analysis_series_overrides").upsert({item_key,series_name,updated_at:new Date().toISOString()},{onConflict:"item_key"});
  if(error)throw error;
  return NextResponse.json({ok:true,item_key,series_name});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"분류 저장 실패"},{status:500});}
}
export async function PATCH(request:Request){
 try{
  const body=await request.json();
  const series_name=clean(body.series_name);
  if(!series_name||series_name.length>80) return NextResponse.json({ok:false,message:"작품명이 올바르지 않아."},{status:400});
  if(!Array.isArray(body.item_keys)||body.item_keys.length===0||body.item_keys.length>500)
   return NextResponse.json({ok:false,message:"분류할 상품을 1~500개 선택해줘."},{status:400});
  const keys=[...new Set(body.item_keys.map(clean))];
  if(keys.some(key=>!key||key.length>500))return NextResponse.json({ok:false,message:"상품명이 올바르지 않아."},{status:400});
  const sb=createServiceRoleClient();
  const updated_at=new Date().toISOString();
  const {error}=await sb.from("item_analysis_series_overrides").upsert(keys.map(item_key=>({item_key,series_name,updated_at})),{onConflict:"item_key"});
  if(error)throw error;
  return NextResponse.json({ok:true,count:keys.length,series_name});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"일괄 작품 분류 실패"},{status:500});}
}
export async function DELETE(request:Request){
 try{
  const body=await request.json();
  const item_key=clean(body.item_key);
  if(!item_key)return NextResponse.json({ok:false,message:"상품 키가 필요해."},{status:400});
  const sb=createServiceRoleClient();
  const {error}=await sb.from("item_analysis_series_overrides").delete().eq("item_key",item_key);
  if(error)throw error;
  return NextResponse.json({ok:true,item_key});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"자동 분류 복원 실패"},{status:500});}
}
