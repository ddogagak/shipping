"use client";
import Link from "next/link";
import {useEffect,useMemo,useState,type CSSProperties} from "react";
import {classifySeriesByKeywords,type SeriesKeywordRule} from "@/lib/item-analysis-series";
type Sale={id:string;order_id:string;item_name:string;item_price:number;buyer_nickname:string;ordered_at:string;video_id?:string|null;image_url?:string|null};
type Report={ok:boolean;all_time_sales_rows:Sale[];settings?:{item_settings?:{id:string;deleted:boolean}[]}};
type Classified=Sale & {series:string;matched:string[];month:string};
type Summary={series:string;revenue:number;items:number;orders:Set<string>;buyers:Set<string>;broadcasts:Set<string>};
const cash=(n:number)=>Math.round(n).toLocaleString("ko-KR");
const ratio=(a:number,b:number)=>b?(100*a/b).toFixed(1)+"%":"—";
const day=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?"":new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(d)};
const surface:CSSProperties={background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:17};
const field:CSSProperties={border:"1px solid #cbd5e1",background:"#fff",color:"#0f172a",padding:"9px 11px",borderRadius:8};
const th:CSSProperties={padding:"11px 12px",borderBottom:"1px solid #e2e8f0",fontSize:12,color:"#64748b",whiteSpace:"nowrap",textAlign:"right"};
const td:CSSProperties={padding:"10px 12px",borderBottom:"1px solid #f1f5f9",textAlign:"right",whiteSpace:"nowrap"};
function summarize(rows:Classified[]):Summary[]{
 const map=new Map<string,Summary>();
 for(const x of rows){const g=map.get(x.series)||{series:x.series,revenue:0,items:0,orders:new Set<string>(),buyers:new Set<string>(),broadcasts:new Set<string>()};g.revenue+=Number(x.item_price)||0;g.items++;g.orders.add(x.order_id);g.buyers.add(x.buyer_nickname.trim().toLocaleLowerCase());if(x.video_id)g.broadcasts.add(x.video_id);map.set(x.series,g)}
 return [...map.values()].sort((a,b)=>b.revenue-a.revenue);
}
function Bar({value,max}:{value:number;max:number}){return <div style={{background:"#e2e8f0",height:9,borderRadius:8,overflow:"hidden",minWidth:75}}><div style={{height:"100%",width:(value/Math.max(max,1)*100)+"%",background:"#0d9488",borderRadius:8}}/></div>}
export default function WiseItemAnalysis(){
 const [report,setReport]=useState<Report|null>(null),[rules,setRules]=useState<SeriesKeywordRule[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [month,setMonth]=useState("전체"),[series,setSeries]=useState("전체"),[search,setSearch]=useState(""),[sort,setSort]=useState("revenue"),[limit,setLimit]=useState(50);
 useEffect(()=>{let active=true;Promise.all([fetch("/api/sales-management",{cache:"no-store"}),fetch("/api/sales-management/item-keywords",{cache:"no-store"})]).then(async([a,b])=>{const [data,keywords]=await Promise.all([a.json(),b.json()]);if(!a.ok||!data.ok)throw Error(data.message||"매출관리 조회 실패");if(!b.ok||!keywords.ok)throw Error(keywords.message||"작품 키워드 조회 실패");if(active){setReport(data);setRules(keywords.rules||[])}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const all=useMemo(()=>{
  const deleted=new Set((report?.settings?.item_settings||[]).filter(x=>x.deleted).map(x=>String(x.id)));
  const result:Classified[]=[];
  for(const row of report?.all_time_sales_rows||[]){
   if(deleted.has(String(row.id)))continue;
   const classification=classifySeriesByKeywords(row.item_name||"",rules);
   const monthValue=day(row.ordered_at).slice(0,7);
   result.push({...row,series:classification.matches.length>1?"키워드 충돌":classification.series||"미분류",matched:classification.matches,month:monthValue});
  }
  return result;
 },[report,rules]);
 const months=useMemo(()=>[...new Set(all.map(x=>x.month).filter(Boolean))].sort().reverse(),[all]);
 const seriesList=useMemo(()=>[...new Set([...rules.map(x=>x.series_name),...all.map(x=>x.series)])].sort((a,b)=>a.localeCompare(b,"ko")),[rules,all]);
 const monthFiltered=useMemo(()=>all.filter(x=>month==="전체"||x.month===month),[all,month]);
 const filtered=useMemo(()=>monthFiltered.filter(x=>(series==="전체"||x.series===series)&&(!search||[x.item_name,x.buyer_nickname,x.series].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()))),[monthFiltered,series,search]);
 const buckets=useMemo(()=>summarize(filtered),[filtered]);
 const fullBuckets=useMemo(()=>summarize(monthFiltered),[monthFiltered]);
 const revenue=filtered.reduce((s,x)=>s+(Number(x.item_price)||0),0);
 const known=filtered.filter(x=>x.matched.length===1);
 const unknown=filtered.filter(x=>x.matched.length!==1);
 const byMonth=useMemo(()=>{const map=new Map<string,number>();for(const x of all.filter(x=>series==="전체"||x.series===series)){if(!x.month)continue;map.set(x.month,(map.get(x.month)||0)+(Number(x.item_price)||0))}return [...map].sort((a,b)=>a[0].localeCompare(b[0]))},[all,series]);
 const byTitle=useMemo(()=>{const map=new Map<string,{name:string;series:string;count:number;revenue:number;buyers:Set<string>}>();for(const x of filtered){const key=x.series+"|"+x.item_name.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g,"");const v=map.get(key)||{name:x.item_name,series:x.series,count:0,revenue:0,buyers:new Set<string>()};v.count++;v.revenue+=Number(x.item_price)||0;v.buyers.add(x.buyer_nickname);map.set(key,v)}const result=[...map.values()];result.sort((a,b)=>sort==="count"?b.count-a.count:sort==="buyers"?b.buyers.size-a.buyers.size:b.revenue-a.revenue);return result},[filtered,sort]);
 const maxRevenue=Math.max(1,...buckets.map(x=>x.revenue)),maxMonth=Math.max(1,...byMonth.map(x=>x[1]));
 return <main style={{maxWidth:1450,margin:"auto",padding:"25px 20px 70px",color:"#0f172a"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:17}}>
   <div><div style={{fontSize:12,color:"#64748b"}}>매출관리 / 실판매 아이템 분석</div><h1 style={{fontSize:28,margin:"5px 0"}}>와이스 실판매 · 작품별 매출 분석</h1><p style={{fontSize:13,color:"#64748b",margin:0}}>실제 판매 상품명과 판매금액을 기준으로 분석해.</p></div>
   <nav style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link style={field} href="/sales-management">← 매출관리</Link><Link style={field} href="/sales-management/items">판매재고 추정 분석</Link><Link style={{...field,background:"#eff6ff",fontWeight:700}} href="/sales-management/items/keywords">작품 키워드 관리</Link></nav>
  </header>
  <div style={{...surface,background:"#f8fafc",marginBottom:15,fontSize:13,lineHeight:1.75}}><b>기준:</b> 와이스 매출관리에 수집된 실제 판매 아이템·금액을 사용하고, 매출관리에서 제외 처리한 아이템은 제외해. 상품명에 등록한 키워드가 들어가면 작품으로 집계해. 여러 작품에 동시에 해당하면 <b>키워드 충돌</b>, 하나도 없으면 <b>미분류</b>로 표시해. 이 데이터에는 아이템별 확정 원가가 없으므로 <b>순이익이나 수익률은 계산하지 않아.</b> 작품 키워드는 원본 매출·매입 데이터를 바꾸지 않아.</div>
  {loading&&<div style={surface}>매출과 키워드 데이터를 읽는 중…</div>}
  {error&&<div role="alert" style={{...surface,color:"#b91c1c"}}>{error}</div>}
  {!loading&&!error&&<>
   <section style={{...surface,display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,marginBottom:15}}>
    <label>기간 <select style={field} value={month} onChange={e=>{setMonth(e.target.value);setLimit(50)}}><option>전체</option>{months.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>작품 <select style={field} value={series} onChange={e=>{setSeries(e.target.value);setLimit(50)}}><option>전체</option>{seriesList.map(x=><option key={x}>{x}</option>)}</select></label>
    <input aria-label="상품명 또는 구매자 검색" style={{...field,flex:"1 1 220px"}} value={search} onChange={e=>{setSearch(e.target.value);setLimit(50)}} placeholder="상품명 · 구매자 검색"/>
    <button style={field} onClick={()=>{setMonth("전체");setSeries("전체");setSearch("")}}>초기화</button>
   </section>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12,marginBottom:15}}>
    {[
     ["실제 상품 매출",cash(revenue)+"원","매출관리 아이템 판매금액 합계"],
     ["판매 아이템",cash(filtered.length)+"개","판매된 개별 아이템 건수"],
     ["구매 고객",cash(new Set(filtered.map(x=>x.buyer_nickname)).size)+"명","닉네임 기준"],
     ["구매 발생 방송",cash(new Set(filtered.map(x=>x.video_id).filter(Boolean)).size)+"회","방송 ID 있는 건 기준"],
     ["작품 분류 확인",ratio(known.length,filtered.length),cash(known.length)+"개 분류"],
     ["미분류·충돌",cash(unknown.length)+"개",cash(unknown.reduce((n,x)=>n+Number(x.item_price||0),0))+"원"]
    ].map(([name,value,desc])=><div key={name} style={surface}><div style={{fontSize:12,color:"#64748b"}}>{name}</div><div style={{fontSize:22,fontWeight:800,margin:"8px 0"}}>{value}</div><div style={{fontSize:12,color:"#64748b"}}>{desc}</div></div>)}
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,480px),1fr))",gap:15,marginBottom:15}}>
    <section style={surface}><h2 style={{fontSize:18,margin:"0 0 12px"}}>작품별 실제 매출</h2>
     <div style={{display:"grid",gap:13}}>{buckets.map(x=><div key={x.series}><div style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:13,marginBottom:5}}><b>{x.series}</b><span>{cash(x.revenue)}원 · {ratio(x.revenue,revenue)}</span></div><Bar value={x.revenue} max={maxRevenue}/></div>)}</div>
    </section>
    <section style={surface}><h2 style={{fontSize:18,margin:"0 0 12px"}}>월별 작품 매출 추세</h2><p style={{fontSize:12,color:"#64748b"}}>상단 작품 필터에 따라 전체 또는 특정 작품의 월별 판매액을 표시해.</p>
     <div style={{display:"grid",gap:13}}>{byMonth.map(([name,value])=><div key={name}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><b>{name}</b><span>{cash(value)}원</span></div><Bar value={value} max={maxMonth}/></div>)}</div>
    </section>
   </div>
   <section style={{...surface,marginBottom:15}}><h2 style={{fontSize:18,margin:"0 0 12px"}}>작품별 실판매 성과</h2>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["작품","매출","매출 비중","판매 아이템","구매 고객","주문","방송"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{buckets.map(x=><tr key={x.series} onClick={()=>setSeries(x.series)} style={{cursor:"pointer"}}><td style={{...td,textAlign:"left",fontWeight:700}}>{x.series}</td><td style={td}>{cash(x.revenue)}원</td><td style={td}>{ratio(x.revenue,revenue)}</td><td style={td}>{cash(x.items)}개</td><td style={td}>{x.buyers.size}명</td><td style={td}>{x.orders.size}건</td><td style={td}>{x.broadcasts.size}회</td></tr>)}</tbody></table></div>
    <p style={{fontSize:12,color:"#64748b"}}>작품 행을 클릭하면 해당 작품으로 필터링해.</p>
   </section>
   <section style={surface}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><h2 style={{fontSize:18}}>상품명별 실판매 순위</h2><label>정렬 <select style={field} value={sort} onChange={e=>setSort(e.target.value)}><option value="revenue">매출액순</option><option value="count">판매 건수순</option><option value="buyers">구매 고객순</option></select></label></div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["상품명","분류 작품","판매금액 합계","판매 건수","구매 고객"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{byTitle.slice(0,limit).map((x,i)=><tr key={x.series+"_"+x.name+"_"+i}><td style={{...td,textAlign:"left",whiteSpace:"normal",minWidth:250}}>{x.name}</td><td style={td}>{x.series}</td><td style={td}>{cash(x.revenue)}원</td><td style={td}>{cash(x.count)}개</td><td style={td}>{x.buyers.size}명</td></tr>)}</tbody></table></div>
    <p style={{fontSize:12,color:"#64748b",marginTop:12}}>{byTitle.length}종 중 {Math.min(limit,byTitle.length)}종 표시 {limit<byTitle.length&&<button style={{...field,marginLeft:8}} onClick={()=>setLimit(v=>v+50)}>50종 더 보기</button>}</p>
   </section>
  </>}
 </main>;
}
