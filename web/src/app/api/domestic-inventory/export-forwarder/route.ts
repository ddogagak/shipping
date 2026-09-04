import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const SERIES_EN: Record<string,string> = {
  "헌터헌터":"hunter x hunter", "귀멸의칼날":"demon slayer", "나의히어로아카데미아":"my hero academia",
  "프리렌":"frieren", "진격의거인":"attack on titan", "치이카와":"chiikawa", "나루토":"naruto", "기타":"other"
};
const TYPE_EN: Record<string,string> = {
  "아크릴":"acrylic", "지류":"paper goods", "뱃지":"badge", "피규어":"figure", "키링":"keychain", "기타":"goods"
};

function englishProductName(seriesName:unknown,itemType:unknown){
  const series=String(seriesName||"").trim(),type=String(itemType||"").trim();
  return `${SERIES_EN[series]||series||"other"} ${TYPE_EN[type]||type||"goods"}`.trim();
}

function setCell(ws:XLSX.WorkSheet,row:number,column:number,value:string|number,styleSource?:XLSX.CellObject){
  const address=XLSX.utils.encode_cell({r:row-1,c:column});
  const cell:XLSX.CellObject={t:typeof value==="number"?"n":"s",v:value};
  if(styleSource?.s)cell.s=styleSource.s;
  if(styleSource?.z)cell.z=styleSource.z;
  ws[address]=cell;
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const ids:string[]=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean):[];
    if(!ids.length)return NextResponse.json({ok:false,message:"엑셀로 출력할 아이템을 체크해줘."},{status:400});
    if(body.country!=="JP")return NextResponse.json({ok:false,message:"중국 배대지 양식은 아직 등록되지 않았어."},{status:400});

    const supabase=createServiceRoleClient();
    const{data,error}=await supabase.from("inventory_items").select("id,series_name,item_type,source_url,image_url,purchase_price,total_price,yen_price,quantity,created_at").in("id",ids);
    if(error)throw error;
    const byId=new Map((data??[]).map(item=>[String(item.id),item]));
    const items=ids.map(id=>byId.get(id)).filter(Boolean) as NonNullable<typeof data>;
    if(!items.length)return NextResponse.json({ok:false,message:"선택한 아이템을 찾지 못했어."},{status:404});

    const templatePath=path.join(process.cwd(),"public/templates/basic_upload_afterOrder_sample_ko.xls");
    if(!fs.existsSync(templatePath))throw new Error("일본 배대지 엑셀 템플릿이 없어.");
    const workbook=XLSX.read(fs.readFileSync(templatePath),{type:"buffer",cellStyles:true});
    const worksheet=workbook.Sheets["엑셀 업로드 양식"];
    if(!worksheet)throw new Error("템플릿의 '엑셀 업로드 양식' 시트를 찾지 못했어.");

    const templateCells=Array.from({length:14},(_,column)=>worksheet[XLSX.utils.encode_cell({r:1,c:column})]);
    const range=XLSX.utils.decode_range(worksheet["!ref"]||"A1:N1");
    for(let row=1;row<=range.e.r;row++)for(let column=0;column<14;column++)delete worksheet[XLSX.utils.encode_cell({r:row,c:column})];

    items.forEach((item,index)=>{
      const purchasePrice=Number(item.purchase_price??item.total_price??item.yen_price??0);
      const inventoryQuantity=Number(item.quantity??1);
      const values:Array<string|number>=[600,2,englishProductName(item.series_name,item.item_type),"","",String(item.source_url||""),String(item.image_url||""),1,"",111,Number.isFinite(purchasePrice)?purchasePrice:0,Number.isFinite(inventoryQuantity)?inventoryQuantity:1,"",""];
      values.forEach((value,column)=>setCell(worksheet,index+2,column,value,templateCells[column]));
    });
    worksheet["!ref"]=`A1:X${Math.max(2,items.length+1)}`;

    const output=XLSX.write(workbook,{type:"buffer",bookType:"xls",cellStyles:true});
    return new NextResponse(output,{headers:{
      "Content-Type":"application/vnd.ms-excel",
      "Content-Disposition":`attachment; filename="japan_forwarder_${new Date().toISOString().slice(0,10).replaceAll("-","")}.xls"`
    }});
  }catch(error){
    return NextResponse.json({ok:false,message:error instanceof Error?error.message:"엑셀 생성 실패"},{status:500});
  }
}
