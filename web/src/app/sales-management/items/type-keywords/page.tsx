"use client";
import Link from "next/link";
import {useEffect,useMemo,useState,type CSSProperties} from "react";
import {classifyTypeByKeywords,normalizeTypeKeyword,DEFAULT_ANALYSIS_TYPES,type TypeKeywordRule} from "@/lib/item-analysis-type";
const control:CSSProperties={border:"1px solid #cbd5e1",borderRadius:9,padding:"9px 11px",background:"#fff",color:"#0f172a"};
const card:CSSProperties={padding:18,border:"1px solid #e2e8f0",background:"#fff",borderRadius:14};
const split=(v:string)=>[...new Set(v.split(/[\n,，]+/).map(x=>x.trim()).filter(Boolean))];
export default function TypeKeywordEditor(){
 const [rules,setRules]=useState<TypeKeywordRule[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[selected,setSelected]=useState(""),[original,setOriginal]=useState(""),[title,setTitle]=useState(""),[raw,setRaw]=useState(""),[sample,setSample]=useState("");
 async function load(){
  const r=await fetch("/api/sales-management/type-keywords",{cache:"no-store"});const j=await r.json();
  if(!r.ok||!j.ok)throw Error(j.message||"유형 키워드 불러오기 실패");
  const next:TypeKeywordRule[]=j.rules||[];
  setRules(next);
  return next;
 }
 useEffect(()=>{let active=true;fetch("/api/sales-management/type-keywords",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||"키워드 조회 실패");if(active)setRules(j.rules||[])}).catch(e=>{if(active)setMessage(String(e.message||e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const catalog=useMemo(()=>{
  const map=new Map<string,TypeKeywordRule>();
  for(const name of DEFAULT_ANALYSIS_TYPES)map.set(name,rules.find(r=>r.type_name===name)||{type_name:name,keywords:[]});
  for(const rule of rules)map.set(rule.type_name,rule);
  for(const name of DEFAULT_ANALYSIS_TYPES){
   if(name==="기타"||name==="미분류")continue;
   if(!map.has(name))map.set(name,{type_name:name,keywords:[]});
  }
  return [...map.values()];
 },[rules]);
 function choose(name:string){const found=rules.find(x=>x.type_name===name);setSelected(name);setOriginal(found?name:"");setTitle(name);setRaw(found?.keywords.join("\n")||"");setMessage("")}
 function fresh(){setSelected("");setOriginal("");setTitle("");setRaw("");setMessage("")}
 const keywords=split(raw);
 const duplicate=useMemo(()=>keywords.map(keyword=>({keyword,others:rules.filter(rule=>rule.type_name!==original&&rule.keywords.some(x=>normalizeTypeKeyword(x)===normalizeTypeKeyword(keyword))).map(x=>x.type_name)})).filter(x=>x.others.length>0),[keywords,rules,original]);
 const sampleResults=useMemo(()=>classifyTypeByKeywords(sample,[...rules.filter(x=>x.type_name!==(selected||original)),...(title.trim()?[{type_name:title.trim(),keywords}]:[])]),[sample,rules,selected,original,title,raw]);
 async function save(){
  if(!title.trim()){setMessage("유형명을 입력해줘.");return;}
  if(saving)return;
  setSaving(true);setMessage("");
  try{
   const response=await fetch("/api/sales-management/type-keywords",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({type_name:title.trim(),original_type_name:original,keywords})});
   const j=await response.json();if(!response.ok||!j.ok)throw Error(j.message||"저장 실패");
   const next=await load();const saved=next.find(x=>x.type_name===j.type_name);
   setSelected(j.type_name);setOriginal(j.type_name);setTitle(j.type_name);setRaw((saved?.keywords||[]).join("\n"));setMessage("저장 완료! 아이템 분석과 재고 투자성과에 새 키워드를 사용해.");
  }catch(e){setMessage(e instanceof Error?e.message:"저장 오류")}finally{setSaving(false)}
 }
 async function remove(){
  if(!original||saving)return;
  if(!window.confirm("‘"+original+"’ 유형의 키워드 규칙을 삭제할까? 원본 상품이나 매입 데이터는 삭제되지 않아."))return;
  setSaving(true);setMessage("");
  try{
   const r=await fetch("/api/sales-management/type-keywords",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({type_name:original})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||"삭제 실패");
   await load();fresh();setMessage("키워드 규칙을 삭제했어. 원본 상품 데이터는 그대로야.");
  }catch(e){setMessage(e instanceof Error?e.message:"삭제 오류")}finally{setSaving(false)}
 }
 return <main style={{maxWidth:1250,margin:"0 auto",padding:"26px 20px 65px",color:"#0f172a"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:18}}>
   <div><div style={{fontSize:12,color:"#64748b"}}>매출관리 / 아이템 분석 / 유형 키워드 관리</div><h1 style={{margin:"7px 0",fontSize:27}}>유형별 키워드 풀 관리</h1><p style={{fontSize:13,color:"#64748b",margin:0}}>상품명으로 유형을 분류할 단어를 직접 추가·수정·삭제해.</p></div>
   <div style={{display:"flex",gap:8}}><Link href="/sales-management/items" style={control}>← 아이템 분석</Link><Link href="/sales-management" style={control}>매출관리</Link></div>
  </header>
  <div style={{...card,background:"#f8fafc",fontSize:13,lineHeight:1.75,marginBottom:16}}>키워드는 <b>소싱·매입·방송판매재고·매출 분석·빵.store</b>에 공통 적용돼. 복합 키워드(클리어파일→문구, 코스터→지류, 아크릴 키링→키링, 마그넷 스티커→마그넷) 우선 판별 후, 지류 → 피규어 → 인형 → 아크릴 → 뱃지 → 키링 → 마그넷 → 문구 → 기타 순으로 판별해. 기존 등록 유형은 우선 유지하고, 특수 규칙과 기타·미분류에 분류를 적용해. 원본 유형과 SKU는 변경하지 않아.</div>
  {message&&<div role="status" style={{...card,marginBottom:14,background:"#f0f9ff",fontSize:13}}>{message}</div>}
  {loading?<div style={card}>유형 목록 불러오는 중…</div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,350px),1fr))",gap:16,alignItems:"start"}}>
   <section style={card}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8}}><h2 style={{fontSize:18,margin:0}}>유형 목록 · {catalog.length}개</h2><button style={control} onClick={fresh}>+ 새 유형</button></div>
    <div style={{display:"grid",gap:7}}>
     {catalog.map(rule=><button key={rule.type_name} onClick={()=>choose(rule.type_name)} style={{...control,textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:selected===rule.type_name?"#eff6ff":"#fff",borderColor:selected===rule.type_name?"#60a5fa":"#cbd5e1",cursor:"pointer"}}><b>{rule.type_name}</b><span style={{fontSize:12,color:"#64748b"}}>{rule.keywords.length}개 키워드</span></button>)}
    </div>
   </section>
   <section style={card}>
    <h2 style={{fontSize:18,margin:"0 0 14px"}}>{original?"유형 키워드 수정":selected?"새 유형 키워드 등록":"새 유형 추가"}</h2>
    <label style={{fontSize:13,fontWeight:700,display:"block",marginBottom:12}}>표준 유형명<input value={title} disabled={!!original} onChange={e=>setTitle(e.target.value)} placeholder="예: 문구" style={{...control,width:"100%",boxSizing:"border-box",marginTop:5}}/></label>
    <label style={{fontSize:13,fontWeight:700,display:"block"}}>인식할 키워드<textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={12} placeholder={"클리어파일\n볼펜\n노트\nクリアファイル"} style={{...control,width:"100%",boxSizing:"border-box",marginTop:6,resize:"vertical",lineHeight:1.7}}/></label>
    <p style={{fontSize:12,color:"#64748b",lineHeight:1.65}}>키워드를 한 줄에 하나씩 입력해. 쉼표로도 구분 가능해. 영문 대소문자와 띄어쓰기는 구분하지 않아. 너무 짧고 일반적인 단어는 다른 유형과 잘못 매칭될 수 있어.</p>
    <div style={{fontSize:12,marginBottom:10}}>현재 <b>{keywords.length}개</b> 키워드</div>
    {duplicate.length>0&&<div style={{padding:10,borderRadius:8,background:"#fff7ed",fontSize:12,marginBottom:10}}>다른 유형에도 등록된 키워드: {duplicate.map(x=>x.keyword+" ("+x.others.join(", ")+")").join(" · ")}</div>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={{...control,background:"#0f172a",color:"#fff"}} disabled={saving} onClick={()=>void save()}>{saving?"저장 중…":"키워드 저장"}</button>{original&&<button style={{...control,color:"#b91c1c"}} disabled={saving} onClick={()=>void remove()}>유형 규칙 삭제</button>}<button style={control} onClick={fresh}>취소 / 초기화</button></div>
    <div style={{borderTop:"1px solid #e2e8f0",marginTop:20,paddingTop:14}}>
     <h3 style={{fontSize:15,margin:"0 0 6px"}}>상품명 매칭 미리보기</h3>
     <input value={sample} onChange={e=>setSample(e.target.value)} placeholder="예: 치이카와 클리어파일" style={{...control,width:"100%",boxSizing:"border-box"}}/>
     {sample.trim()&&<div style={{fontSize:13,marginTop:9}}>{sampleResults.special||sampleResults.matches.length===1?<span>분류 결과: <b>{sampleResults.type}</b></span>:sampleResults.matches.length>1?<span>분류 결과: <b>{sampleResults.type}</b> · 일치 유형: {sampleResults.matches.join(" / ")}</span>:<span style={{color:"#64748b"}}>일치하는 유형 키워드 없음</span>}</div>}
    </div>
   </section>
  </div>}
 </main>;
}
