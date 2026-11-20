import {NextResponse} from "next/server";
import {createServiceRoleClient} from "@/lib/supabase/server";
export const runtime="nodejs";
const normalize=(value:unknown)=>String(value||"").normalize("NFKC").trim();
export async function GET(){
 try{
  const sb=createServiceRoleClient();
  const {data,error}=await sb.from("item_analysis_type_keywords").select("type_name,keywords,updated_at").order("type_name");
  if(error)throw error;
  return NextResponse.json({ok:true,rules:data||[]});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"키워드 조회 실패"},{status:500});}
}
export async function PUT(req:Request){
 try{
  const body=await req.json();
  const type_name=normalize(body.type_name);
  const original=normalize(body.original_type_name);
  if(type_name.length<1||type_name.length>80||["기타","미분류","미분류(키워드 충돌)","랜덤박스"].includes(type_name))return NextResponse.json({ok:false,message:"유형명은 1~80자이며 기타·미분류·랜덤박스는 예약된 유형이야."},{status:400});
  if(!Array.isArray(body.keywords))return NextResponse.json({ok:false,message:"키워드 목록이 올바르지 않아."},{status:400});
  const keywords: string[]=[...new Set<string>((body.keywords as unknown[]).map((value: unknown) => normalize(value)).filter((value: string) => value.length > 0))];
  if(keywords.length>200||keywords.some(x=>x.length>100))return NextResponse.json({ok:false,message:"키워드는 최대 200개, 각각 100자 이하여야 해."},{status:400});
  const sb=createServiceRoleClient();
  if(original&&original!==type_name)return NextResponse.json({ok:false,message:"유형 이름을 변경하려면 새 유형을 등록하고 기존 규칙을 삭제해줘."},{status:400});
  const {error}=await sb.from("item_analysis_type_keywords").upsert({type_name,keywords,updated_at:new Date().toISOString()},{onConflict:"type_name"});
  if(error)throw error;
  return NextResponse.json({ok:true,type_name,keywords});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"키워드 저장 실패"},{status:500});}
}
export async function DELETE(req:Request){
 try{
  const body=await req.json();
  const type_name=normalize(body.type_name);
  if(!type_name)return NextResponse.json({ok:false,message:"삭제할 유형명을 지정해줘."},{status:400});
  const sb=createServiceRoleClient();
  const {error}=await sb.from("item_analysis_type_keywords").delete().eq("type_name",type_name);
  if(error)throw error;
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({ok:false,message:e instanceof Error?e.message:"삭제 실패"},{status:500});}
}
