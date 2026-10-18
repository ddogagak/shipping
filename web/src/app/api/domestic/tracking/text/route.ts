import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Shipping = {order_id:string; tracking_number:string|null; shipping_status:string|null};
type Order = {order_id:string; nickname:string|null; recipient_name:string|null; order_status:string|null; domestic_shipping:Shipping|Shipping[]|null};
type Source = {id:number;name:string;phone:string;tracking_number:string;print_count:number};
type Preview = Source & {match_status:"ready"|"missing"|"ambiguous"|"ineligible"|"duplicate";reason:string;order_id:string;db_name:string;nickname:string};
const trim=(v:unknown)=>String(v??"").trim();
const normalizeName=(v:unknown)=>trim(v).normalize("NFKC").replace(/\s+/g,"").toLowerCase();
const digits=(v:unknown)=>trim(v).replace(/\D/g,"");
function shipping(order:Order):Shipping|null {
  return Array.isArray(order.domestic_shipping)?order.domestic_shipping[0]??null:order.domestic_shipping??null;
}

// Handles both tab/newline-delimited Logen copies and text pasted without line breaks.
// Example: 홍길동0507-0000-0000송장출력453-1234-56781회
function parseLogenText(text:string):Source[]{
  const body=text.replace(/고객명\s*연락처\s*진행상태\s*운송장번호\s*출력횟수/g,"");
  const regex=/([가-힣]{2,15})\s*(0\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})\s*송장출력\s*(\d{3}[-\s]?\d{4}[-\s]?\d{4})\s*(\d+)회/g;
  return [...body.matchAll(regex)].map((m,id)=>({
    id,name:m[1].trim(),phone:m[2].trim(),tracking_number:digits(m[3]),
    print_count:Number(m[4])
  }));
}

async function makePreview(source:Source[]):Promise<Preview[]>{
  const supabase=createServiceRoleClient();
  const orders:Order[]=[];
  // Supabase defaults to 1,000 rows. Review all names without silent truncation.
  for(let offset=0;;offset+=500){
    const {data,error}=await supabase.from("domestic_order")
      .select("order_id,nickname,recipient_name,order_status,domestic_shipping(order_id,tracking_number,shipping_status)")
      .order("order_id").range(offset,offset+499);
    if(error)throw new Error("DDOGA 주문 조회 실패: "+error.message);
    orders.push(...((data??[]) as Order[]));
    if((data??[]).length<500)break;
  }
  const byRecipient=new Map<string,Order[]>();
  const byNickname=new Map<string,Order[]>();
  for(const order of orders){
    for(const [map,value] of [[byRecipient,order.recipient_name],[byNickname,order.nickname]] as const){
      const k=normalizeName(value);
      if(k)map.set(k,[...(map.get(k)??[]),order]);
    }
  }
  const names=new Map<string,number>(),tracking=new Map<string,number>();
  for(const row of source){
    const k=normalizeName(row.name);
    names.set(k,(names.get(k)??0)+1);
    tracking.set(row.tracking_number,(tracking.get(row.tracking_number)??0)+1);
  }
  return source.map(row=>{
    const normalized=normalizeName(row.name);
    const recipientMatches=byRecipient.get(normalized)??[];
    const matches=recipientMatches.length?recipientMatches:(byNickname.get(normalized)??[]);
    const eligible=matches.filter(o=>{
      const s=shipping(o);
      return o.order_status==="packaged"&&Boolean(s)&&s!.shipping_status!=="done"&&!digits(s!.tracking_number);
    });
    let match_status:Preview["match_status"]="missing",reason="동일한 고객명 또는 닉네임의 DDOGA 주문을 찾지 못했어.";
    if((names.get(normalized)??0)>1||(tracking.get(row.tracking_number)??0)>1){
      match_status="duplicate";
      reason="붙여넣은 원본에 이름 또는 송장번호가 중복돼. 확인 후 다시 입력해 줘.";
    }else if(eligible.length>1){
      match_status="ambiguous";reason="포장완료·미배송완료·운송장 공백 주문이 여러 건이어서 자동 선택하지 않았어.";
    }else if(eligible.length===1){match_status="ready";reason="반영 가능";}
    else if(matches.length){
      match_status="ineligible";
      reason=matches.length>1?"일치 이름의 주문은 있지만 조건을 충족하는 주문이 없어.":
        matches[0].order_status!=="packaged"?"주문상태가 포장완료가 아니야.":
        !shipping(matches[0])?"배송정보 행이 없어. 임의로 만들지 않았어.":
        shipping(matches[0])?.shipping_status==="done"?"이미 배송완료 상태야.":
        digits(shipping(matches[0])?.tracking_number)?"이미 운송장번호가 있어. 덮어쓰지 않았어.":"업데이트 조건 불일치";
    }
    const matched=eligible.length===1?eligible[0]:null;
    return {...row,match_status,reason,order_id:matched?.order_id??"",
      db_name:matched?.recipient_name??"",nickname:matched?.nickname??""};
  });
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const raw=trim(body?.text);
    const mode=trim(body?.mode);
    if(!["preview","apply"].includes(mode))return NextResponse.json({error:"지원하지 않는 처리 방식"},{status:400});
    if(!raw||raw.length>100000)return NextResponse.json({error:"100,000자 이하의 로젠 출력내역을 붙여넣어 줘."},{status:400});
    const source=parseLogenText(raw);
    if(!source.length)return NextResponse.json({error:"로젠 '고객명 / 연락처 / 송장출력 / 운송장번호 / 출력횟수' 형식을 찾지 못했어."},{status:400});
    if(source.length>200)return NextResponse.json({error:"한 번에 최대 200건을 처리할 수 있어."},{status:400});
    const rows=await makePreview(source);
    if(mode==="preview")return NextResponse.json({ok:true,rows,total:rows.length,ready:rows.filter(r=>r.match_status==="ready").length});
    const ids:unknown=body?.selected_ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>200||!ids.every(x=>Number.isInteger(x))||new Set(ids).size!==ids.length)
      return NextResponse.json({error:"체크한 항목의 번호가 올바르지 않아."},{status:400});
    const selected=rows.filter(r=>ids.includes(r.id));
    if(selected.length!==ids.length)return NextResponse.json({error:"선택한 목록을 다시 확인해 줘."},{status:409});
    // Never let a previously valid preview bypass current state checks.
    const db=createServiceRoleClient();
    const results:{id:number;name:string;order_id:string;ok:boolean;error?:string}[]=[];
    for(const row of selected){
      if(row.match_status!=="ready"){
        results.push({id:row.id,name:row.name,order_id:row.order_id,ok:false,error:row.reason});continue;
      }
      const {data:order,error:readError}=await db.from("domestic_order")
        .select("order_id,order_status,domestic_shipping(order_id,tracking_number,shipping_status)")
        .eq("order_id",row.order_id).single();
      if(readError||!order){
        results.push({id:row.id,name:row.name,order_id:row.order_id,ok:false,error:"주문 재확인 실패"});continue;
      }
      const s=shipping(order as Order);
      if(order.order_status!=="packaged"||!s||s.shipping_status==="done"||digits(s.tracking_number)){
        results.push({id:row.id,name:row.name,order_id:row.order_id,ok:false,error:"저장 직전 조건이 변경됐어."});continue;
      }
      let query=db.from("domestic_shipping")
        .update({tracking_number:row.tracking_number,updated_at:new Date().toISOString()})
        .eq("order_id",row.order_id);
      query=s.tracking_number===null?query.is("tracking_number",null):query.eq("tracking_number",s.tracking_number);
      query=s.shipping_status===null?query.is("shipping_status",null):query.eq("shipping_status",s.shipping_status);
      const {data:changed,error:writeError}=await query.select("order_id,tracking_number");
      if(writeError||(changed??[]).length!==1){
        results.push({id:row.id,name:row.name,order_id:row.order_id,ok:false,error:writeError?.message||"업데이트 대상 0건"});continue;
      }
      const {data:verified,error:verifyError}=await db.from("domestic_shipping")
        .select("tracking_number").eq("order_id",row.order_id).single();
      const confirmed=!verifyError&&digits(verified?.tracking_number)===row.tracking_number;
      results.push({id:row.id,name:row.name,order_id:row.order_id,ok:confirmed,...(!confirmed?{error:"저장 후 송장번호 검증 실패"}:{})});
    }
    return NextResponse.json({ok:true,updated:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results});
  }catch(e){
    return NextResponse.json({error:"로젠 텍스트 운송장 처리 실패",detail:e instanceof Error?e.message:String(e)},{status:500});
  }
}
