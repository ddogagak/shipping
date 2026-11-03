import {NextResponse} from "next/server";
import {createServiceRoleClient} from "@/lib/supabase/server";
export const runtime="nodejs";
const normalize=(value:unknown)=>String(value||"").normalize("NFKC").trim();
export async function GET(){
 try{
  const sb=createServiceRoleClient();
  const {data,error}=await sb.from("item_analysis_series_keywords").select("series_name,keywords,updated_at").order("series_name");
  if(error)throw error;
  return NextResponse.json({ok:true,rules:data||[]});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"키워드 조회 실패"},{status:500});}
}
export async function PUT(req:Request){
 try{
  const body=await req.json();
  const series_name=normalize(body.series_name);
  const original=normalize(body.original_series_name);
  if(series_name.length<1||series_name.length>80)return NextResponse.json({ok:false,message:"작품명은 1~80자로 입력해줘."},{status:400});
  if(!Array.isArray(body.keywords))return NextResponse.json({ok:false,message:"키워드 목록이 올바르지 않아."},{status:400});
  const keywords=[...new Set(body.keywords.map(normalize).filter(Boolean))];
  if(keywords.length>200||keywords.some(x=>x.length>100))return NextResponse.json({ok:false,message:"키워드는 최대 200개, 각각 100자 이하여야 해."},{status:400});
  const sb=createServiceRoleClient();
  if(original&&original!==series_name){
   const {data:existing,error:readError}=await sb.from("item_analysis_series_keywords").select("series_name").eq("series_name",series_name).maybeSingle();
   if(readError)throw readError;
   if(existing)return NextResponse.json({ok:false,message:"이미 등록된 작품명이야."},{status:409});
   const {error:insertError}=await sb.from("item_analysis_series_keywords").insert({series_name,keywords,updated_at:new Date().toISOString()});
   if(insertError)throw insertError;
   const {error:deleteError}=await sb.from("item_analysis_series_keywords").delete().eq("series_name",original);
   if(deleteError)throw deleteError;
  }else{
   const {error}=await sb.from("item_analysis_series_keywords").upsert({series_name,keywords,updated_at:new Date().toISOString()},{onConflict:"series_name"});
   if(error)throw error;
  }
  return NextResponse.json({ok:true,series_name,keywords});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"키워드 저장 실패"},{status:500});}
}
export async function DELETE(req:Request){
 try{
  const body=await req.json();
  const series_name=normalize(body.series_name);
  if(!series_name)return NextResponse.json({ok:false,message:"삭제할 작품명을 지정해줘."},{status:400});
  const sb=createServiceRoleClient();
  const {error}=await sb.from("item_analysis_series_keywords").delete().eq("series_name",series_name);
  if(error)throw error;
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"삭제 실패"},{status:500});}
}
