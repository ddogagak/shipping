"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SetStateAction } from "react";
import { baseProductName, imageIdentity, normalizeProductName, recommendInventory, inventoryKeywordFrequency, saleBroadcastGroupKey, saleProductKey, compareInventoryRecommendations } from "@/lib/wise-inventory-match";
import SaleUnitsEditor, {saveSaleUnits} from "../SaleUnitsEditor";
import {saleUnits} from "@/lib/sale-units";
import {manualSeriesForSale,wiseListingId} from "@/lib/item-analysis-series";

type LinkRow = { id: number; wise_stock_id: number | string; purchase_item_id: string | null; random_box_id: string | null; inventory_group_id: string | null; quantity: number; applied_units: number };
type Sale = { id: string; video_id: string; wise_user_id: string | null; buyer_nickname: string; item_name: string; item_price: number; sale_units: number; image_url: string | null; sold_at: string | null; links: LinkRow[]; manual_series?:string|null };
type Show = { video_id: string; first_sale: string; last_sale: string; revenue: number; count: number; buyer_count: number };
type Candidate = { type: "purchase_item" | "random_box" | "inventory_group"; id: string; name: string; option: string; image_url: string | null; series: string; unit_price: number; currency: string; component_count: number; sale_price: number | null; reference_prices?:number[]; stock_status: string; purchase_date: string; item_type: string; remaining_units: number; random_member: boolean };
type Family = { key: string; title: string; count: number; price:number; revenue: number; linked: number; image: string | null; broadcastAt:string|null; items: Sale[] };

const panel: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 13, padding: 16, background: "#fff" };
const field: CSSProperties = { padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff", maxWidth: "100%" };
const btn: CSSProperties = { ...field, cursor: "pointer", fontWeight: 750, fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 13, verticalAlign: "middle" };
const won = (n: number) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
// Exact KRW price searches accept both typed numbers and copied currency labels.
function parsePriceSearch(value:string):number|null {
  const raw=value.normalize('NFKC').trim().replace(/^₩\s*/, '').replace(/\s*원$/, '').replace(/[\s,]/g,'');
  if(!/^\d+$/.test(raw))return null;
  const price=Number(raw);
  return Number.isSafeInteger(price)?price:null;
}
function matchesPriceSearch(query:string,prices:Array<number|null|undefined>):boolean {
  if(!query.trim())return true;
  const price=parsePriceSearch(query);
  return price!==null && prices.some(p=>typeof p==='number'&&Number.isFinite(p)&&p===price);
}
const kst = (s: string | null) => s ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
function familyOf(row: Sale) {
  const name = baseProductName(row.item_name);
  const key = saleBroadcastGroupKey(row,wiseListingId(row.image_url));
  return { key, name };
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const error = new Error(data.message || "조회 또는 저장에 실패했어.");
    (error as Error & { conflict?: boolean }).conflict = Boolean(data.conflict);
    throw error;
  }
  return data;
}
function monthNow() {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(date);
  return (parts.find(x => x.type === "year")?.value || "") + "-" + (parts.find(x => x.type === "month")?.value || "");
}
function targetKey(row: LinkRow) {
  return row.inventory_group_id ? "inventory_group|"+row.inventory_group_id : row.purchase_item_id ? "purchase_item|" + row.purchase_item_id : row.random_box_id ? "random_box|" + row.random_box_id : "";
}
export default function WiseInventoryLinkPage() {
  const [month, setMonth] = useState(monthNow);
  const [shows, setShows] = useState<Show[]>([]);
  const [videoId, setVideoId] = useState("");
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [inventoryNames,setInventoryNames]=useState<Record<string,string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [groupSearch, setGroupSearch] = useState("");
  const [salePriceSearch,setSalePriceSearch]=useState("");
  const [saleSort,setSaleSort]=useState<"quantity"|"price_desc"|"price_asc">("quantity");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePriceSearch,setCandidatePriceSearch]=useState("");
  const [candidateType, setCandidateType] = useState("all");
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingShows, setLoadingShows] = useState(false);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cutover, setCutover] = useState("");
  const [deductionMode, setDeductionMode] = useState<"future"|"historical"|"link_only"|"reset_reconcile">("future");
  const [remember, setRemember] = useState(false);
  const [linkView,setLinkView]=useState<Candidate|null>(null);
  const [viewLinks,setViewLinks]=useState<any[]>([]);
  const [viewLoading,setViewLoading]=useState(false);
  const [viewSaving,setViewSaving]=useState(false);
  const [viewError,setViewError]=useState("");
  const [viewChecked,setViewChecked]=useState<number[]>([]);
  const showsRequest = useRef(0);
  const salesRequest = useRef(0);

  // A new selection on the left must never inherit inventory targets/units
  // chosen for the previous sale. Clear them in the same event, before saving.
  const changeSaleSelection = (next: SetStateAction<Record<string, boolean>>) => {
    setSelected(next);
    setTargets({});
    setRemember(false);
  };

  async function fetchCandidateLinks(candidate:Candidate){
    setViewLoading(true);setViewError("");
    try{
      const qs=new URLSearchParams({target_type:candidate.type,target_id:candidate.id});
      const data=await requestJson("/api/sale-inventory/linked-sales?"+qs.toString());
      setViewLinks(data.links||[]);
    }catch(e){setViewError(e instanceof Error?e.message:"연결 목록 조회 실패");}
    finally{setViewLoading(false);}
  }
  function openCandidateLinks(candidate:Candidate){
    setLinkView(candidate);setViewLinks([]);setViewChecked([]);
    void fetchCandidateLinks(candidate);
  }
  async function unlinkCandidateLinks(ids:number[]){
    if(!linkView||viewSaving||!ids.length)return;
    const picked=viewLinks.filter(x=>ids.includes(Number(x.id)));
    const allocated=picked.reduce((n,x)=>n+Number(x.allocated_units||0),0);
    const groupWarning=picked.some(x=>x.target_type==="inventory_group")?"\\n묶음 연결은 다른 매입차수의 재고도 복원할 수 있어.":"";
    if(!window.confirm(ids.length+"건 · "+allocated+"개 연결을 해제할까?\\n실판매 원본은 유지하고 실제 차감 재고만 복원해."+groupWarning))return;
    setViewSaving(true);setViewError("");
    try{
      const data=await requestJson("/api/sale-inventory/linked-sales",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({target_type:linkView.type,target_id:linkView.id,link_ids:ids})
      });
      setViewChecked([]);
      await Promise.all([fetchCandidateLinks(linkView),loadInventory(),...(videoIds.length?[loadSales(videoIds)]:[])]);
      setMessage(data.removed+"건 연결 해제 · 재고 "+data.restored+"개 복원");
    }catch(e){setViewError(e instanceof Error?e.message:"연결 해제 실패");}
    finally{setViewSaving(false);}
  }

  const loadShows = useCallback(async () => {
    const requestId = ++showsRequest.current;
    ++salesRequest.current;
    setLoadingShows(true); setError("");
    setShows([]); setVideoId(""); setVideoIds([]); setSales([]); setSelected({}); setTargets({}); setRemember(false);
    try {
      const data = await requestJson("/api/sales-management/sale-links?mode=shows&month=" + encodeURIComponent(month));
      if (requestId !== showsRequest.current) return;
      setShows(data.shows || []);
    } catch (e) { if (requestId === showsRequest.current) setError(e instanceof Error ? e.message : "방송 조회 실패"); }
    finally { if (requestId === showsRequest.current) setLoadingShows(false); }
  }, [month]);
  useEffect(() => { void loadShows(); }, [loadShows]);

  const loadSales = useCallback(async (ids: string[]) => {
    const requestId = ++salesRequest.current;
    setSales([]); setSelected({}); setTargets({}); setRemember(false);
    if (!ids.length) { setLoadingSales(false); return; }
    setLoadingSales(true); setError("");
    try {
      const manualRequest=requestJson("/api/sales-management/item-series-overrides").then(data=>({overrides:Object.fromEntries((data.overrides||[]).map((row:{item_key:string;series_name:string})=>[row.item_key,row.series_name])) as Record<string,string>,failed:false})).catch(()=>({overrides:{},failed:true}));
      // The existing endpoint accepts at most 80 broadcasts; split a large month
      // into smaller requests without changing the backend or existing save limits.
      const all = new Map<string, Sale>();
      let cutoff = "";
      for (let offset = 0; offset < ids.length; offset += 40) {
        const params = new URLSearchParams({ mode: "sales" });
        ids.slice(offset, offset + 40).forEach(id => params.append("video_id", id));
        const data = await requestJson("/api/sales-management/sale-links?" + params.toString());
        if (requestId !== salesRequest.current) return;
        for (const row of data.sales || []) all.set(row.id, row);
        cutoff = data.cutover || cutoff;
      }
      const manual=await manualRequest;
      if(requestId!==salesRequest.current)return;
      if(manual.failed)setError("수동 작품 분류를 불러오지 못했어. 판매내역 갱신으로 다시 시도해줘.");
      setSales([...all.values()].map(row=>({...row,manual_series:manualSeriesForSale(row,manual.overrides)})).sort((a,b)=>String(a.sold_at||"").localeCompare(String(b.sold_at||"")) || a.id.localeCompare(b.id)));
      setCutover(cutoff);
    } catch (e) { if (requestId === salesRequest.current) setError(e instanceof Error ? e.message : "판매기록 조회 실패"); }
    finally { if (requestId === salesRequest.current) setLoadingSales(false); }
  }, []);
  useEffect(() => { void loadSales(videoIds); }, [videoIds, loadSales]);

  const loadInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      const data = await requestJson("/api/sales-management/sale-links?mode=inventory");
      setCandidates(data.candidates || []);
      setInventoryNames(data.names||{});
    } catch (e) { setError(e instanceof Error ? e.message : "재고 조회 실패"); }
    finally { setLoadingInventory(false); }
  }, []);
  useEffect(() => { void loadInventory(); }, [loadInventory]);
  const familyGroups = useMemo(() => {
    const map = new Map<string, Family>();
    const broadcastDates = new Map(shows.map(show=>[show.video_id,show.first_sale]));
    for (const row of sales) {
      const { key, name } = familyOf(row);
      const g = map.get(key) || { key, title: name + " · " + won(row.item_price), count: 0, price:row.item_price, revenue: 0, linked: 0, image: row.image_url || null, broadcastAt: broadcastDates.get(row.video_id)||row.sold_at, items: [] };
      g.count += 1;
      g.revenue += row.item_price;
      g.linked += row.links?.length ? 1 : 0;
      g.image ||= row.image_url;
      g.items.push(row);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  }, [sales,shows]);
  const filteredGroups = useMemo(() => familyGroups.filter(g =>
    (!onlyUnlinked || g.linked < g.count) && (!groupSearch || g.title.toLowerCase().includes(groupSearch.trim().toLowerCase()) || (parsePriceSearch(groupSearch)!==null&&matchesPriceSearch(groupSearch,[g.price]))) && matchesPriceSearch(salePriceSearch,[g.price])
  ).sort((a,b)=>(saleSort==='price_desc'?b.price-a.price:saleSort==='price_asc'?a.price-b.price:0)||b.items.reduce((n,s)=>n+saleUnits(s.sale_units),0)-a.items.reduce((n,s)=>n+saleUnits(s.sale_units),0)||a.title.localeCompare(b.title)), [familyGroups, groupSearch, onlyUnlinked,saleSort,salePriceSearch]);
  const filteredCandidates = useMemo(() => {
    const query = normalizeProductName(candidateSearch);
    const chosen = sales.filter(row => selected[row.id]);
    // Compare distinct selected families rather than every identical sale row.
    const samples = [...new Map(chosen.map(row=>[saleProductKey(row),row])).values()].map(s=>({sale:s,frequency:inventoryKeywordFrequency(s.item_name,candidates)}));
    return candidates.filter(c => (candidateType === "all" || c.type === candidateType) &&
      (!query || [c.name, c.option, c.series, c.purchase_date, c.item_type].some(v => normalizeProductName(v).includes(query)) || (parsePriceSearch(candidateSearch)!==null&&matchesPriceSearch(candidateSearch,[c.sale_price,...(c.reference_prices||[])]))) && matchesPriceSearch(candidatePriceSearch,[c.sale_price,...(c.reference_prices||[])]))
      .map(c=>({...c, recommendation:samples.map(s=>recommendInventory(s.sale,c,s.frequency)).sort((a,b)=>b.score-a.score)[0]||{score:0,priorityScore:0,reason:""}}))
      .sort(compareInventoryRecommendations).slice(0,150);
  }, [candidateSearch, candidatePriceSearch, candidates, candidateType, sales, selected]);
  const candidateNames = useMemo(() => new Map([...Object.entries(inventoryNames),...candidates.map(c => [c.type + "|" + c.id, c.name + (c.option ? " · " + c.option : "")] as [string,string])]), [candidates,inventoryNames]);
  const selectedIds = useMemo(() => sales.filter(s => selected[s.id]).map(s => s.id), [sales, selected]);
  const selectedSales = useMemo(()=>sales.filter(s=>selected[s.id]),[sales,selected]);
  const applicableSales = selectedSales.filter(s=>(deductionMode==="historical" || deductionMode==="reset_reconcile") || deductionMode==="future" && cutover && s.sold_at && new Date(s.sold_at)>=new Date(cutover));
  const selectedUnitTotal = selectedSales.reduce((sum,s)=>sum+saleUnits(s.sale_units),0);
  const commonUnits = selectedSales.length && selectedSales.every(s=>s.sale_units===selectedSales[0].sale_units) ? saleUnits(selectedSales[0].sale_units) : 1;
  const canRemember = selectedSales.length>0 && selectedSales.every(s=>Boolean(imageIdentity(s.image_url)) && saleProductKey(s)===saleProductKey(selectedSales[0]));
  const linkedCount = useMemo(() => sales.filter(s => s.links?.length).length, [sales]);
  const selectedTargets = useMemo(() => Object.entries(targets).filter(([, quantity]) => quantity >= 1).map(([key, quantity]) => {
    const candidate = candidates.find(c => c.type + "|" + c.id === key);
    return candidate ? { ...candidate, quantity } : null;
  }).filter((value): value is Candidate & { quantity: number } => value !== null), [candidates, targets]);
  const previews=selectedTargets.map(c=>({c,delta:applicableSales.reduce((sum,s)=>sum+c.quantity-(s.links.find(l=>targetKey(l)===c.type+"|"+c.id)?.applied_units||0),0)}));
  const insufficient=previews.some(({c,delta})=>delta>c.remaining_units);
  async function editUnits(ids:string[], units:number){
    if(busy||!ids.length)return;
    if(!window.confirm(ids.length+"건의 실제 판매 수량을 건당 "+units+"개로 저장할까? 이미 차감한 단일 재고 연결은 차이만 반영해."))return;
    setBusy(true);setError("");setMessage("");
    let completed=0, deducted=0;
    try {
      for(let start=0;start<ids.length;start+=300){
        const batch=ids.slice(start,start+300);
        const data=await saveSaleUnits(batch,units);
        completed+=batch.length;
        deducted+=Number(data.deducted_units??0);
        if(completed<ids.length)setMessage(completed+"/"+ids.length+"건 수량 수정 중…");
      }
      setMessage(completed+"건 수량 수정 완료 · 재고 "+(deducted>0?deducted+"개 추가 차감":deducted<0?-deducted+"개 복원":"변화 없음"));
      setTargets({});
    } catch(e) {
      const reason=e instanceof Error?e.message:"수량 저장 실패";
      setMessage("");
      setError(completed>0?completed+"/"+ids.length+"건 저장 후 중단: "+reason+" · 앞서 저장된 건은 유지돼. 새로고침된 상태에서 다시 선택해줘.":reason);
    } finally {
      if(completed>0){await loadSales(videoIds);await loadInventory();}
      setBusy(false);
    }
  }
  const setGroupSelection = (family: Family, checked: boolean) => {
    changeSaleSelection(prev => {
      const next = { ...prev };
      for (const row of family.items) next[row.id] = checked;
      return next;
    });
  };
  async function save(action: "link" | "unlink", single?: { saleId: string; target: LinkRow }) {
    const ids = single ? [single.saleId] : selectedIds;
    if (!videoIds.length || !ids.length || busy || loadingSales || loadingShows) return;
    if (action === "link" && !selectedTargets.length) { setError("오른쪽에서 연결할 방송판매재고를 체크해줘."); return; }
    if (action === "link" && insufficient) { setError("잔여 재고가 부족해. 건당 수량과 선택 건수를 확인해줘."); return; }
    if (action === "link" && selectedSales.some(s=>s.sale_units!==selectedTargets.reduce((sum,c)=>sum+c.quantity,0)+s.links.filter(l=>!selectedTargets.some(c=>targetKey(l)===c.type+"|"+c.id)).reduce((sum,l)=>sum+l.quantity,0)) && !window.confirm("연결하려는 낱개 수량이 기존 실제 판매 수량과 달라. 연결 수량으로 실제 판매 수량을 변경할까?")) return;
    if(action==='link'&&selectedTargets.some(c=>c.type==='inventory_group')&&selectedTargets.length!==1){setError('동일상품 묶음은 한 번에 하나만 선택해줘.');return;}
    if(action==="link" && deductionMode==="historical" && !window.confirm("과거 판매도 실제 차감합니다. 이미 수동으로 차감한 판매는 중복될 수 있어. 미리보기 수량을 확인했나요?"))return;
    if(action==="link"&&deductionMode==="reset_reconcile"){
      if(selectedTargets.length!==1||selectedTargets[0].type!=="inventory_group"){setError("초기화 재정산은 통합 재고풀 하나만 선택해줘.");return;}
      if(!window.confirm("선택한 "+ids.length+"건의 기존 연결을 새 재고풀로 이전하고, 현재 초기화된 재고에서 과거순으로 다시 차감할까?\n\n기존 판매·매입 원본은 보존하고, 이전 연결은 감사기록에 남겨. 차감됐던 재고가 완전히 초기화되지 않았다면 안전하게 중단해."))return;
    }
    setBusy(true); setError(""); setMessage("");
    let completed=0, affectedLinks=0, deducted=0, remembered=false;
    try {
      const target = single?.target;
      const body = {
        action, deduction_mode: deductionMode==="reset_reconcile"?"historical":deductionMode, reconcile_reset:action==="link"&&deductionMode==="reset_reconcile", remember: remember&&canRemember,
        targets: action === "link" ? selectedTargets.map(row => ({
          target_type: row.type, target_id: row.id, quantity: row.quantity
        })) : undefined,
        target_type: target ? (target.inventory_group_id?'inventory_group':target.purchase_item_id ? "purchase_item" : "random_box") : undefined,
        target_id: target ? (target.inventory_group_id||target.purchase_item_id || target.random_box_id) : undefined
      };
      // Keep the API/DB per-request safety limits but automatically batch larger UI selections.
      const batchSize=action==="link"?Math.min(300,Math.floor(1200/selectedTargets.length)):300;
      for(let start=0;start<ids.length;start+=batchSize){
        const batch=ids.slice(start,start+batchSize);
        const data=await requestJson("/api/sales-management/sale-links", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body:JSON.stringify({...body,stock_ids:batch})
        });
        completed+=batch.length;
        affectedLinks+=Number(data.count??0);
        deducted+=Number(data.deducted_units??0);
        remembered ||= Boolean(data.remembered);
        if(completed<ids.length)setMessage(completed+"/"+ids.length+"건 "+(action==="link"?"연결":"해제")+" 처리 중…");
      }
      setMessage(completed+"건 처리 완료 · 연결 "+affectedLinks+"개 "+(action==="link"?"저장":"해제")+" · "+(deducted>0?`낱개 ${deducted}개 차감`:deducted<0?`낱개 ${-deducted}개 복원`:"재고 변화 없음")+(remembered?" · 다음 방송 자동 매칭 저장됨":""));
      if(action==="link")setTargets({});
    } catch(e) {
      const reason=e instanceof Error?e.message:"매칭 저장 실패";
      setMessage("");
      setError(completed>0?completed+"/"+ids.length+"건 처리 후 중단: "+reason+" · 처리된 건은 유지돼. 갱신된 목록에서 미처리 건만 다시 선택해줘.":reason);
    } finally {
      if(completed>0){await loadSales(videoIds);await loadInventory();}
      setBusy(false);
    }
  }
  const selectedShows = shows.filter(show => videoIds.includes(show.video_id));
  const totalShowRevenue = selectedShows.reduce((sum, show) => sum + show.revenue, 0);
  return <main style={{ padding: 22, maxWidth: 1480, margin: "0 auto", color: "#0f172a", fontFamily: "inherit" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <div><h1 style={{ margin: 0, fontSize: 28 }}>실판매 ↔ 방송판매재고 연결</h1>
        <p style={{ color: "#64748b", margin: "8px 0 0", fontSize: 14 }}>작품·상품 키워드 추천 · 낱개 단위 차감 · 기존 완료 및 과거 수동 재고 보호</p></div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <Link style={btn} href="/sales-management">매출관리</Link>
        <Link style={btn} href="/sale-inventory">방송판매재고</Link>
        <Link style={btn} href="/">메인</Link>
      </div>
    </header>

    {error && <div role="alert" style={{ ...panel, marginBottom: 12, background: "#fef2f2", color: "#991b1b" }}>{error}</div>}
    {message && <div role="status" style={{ ...panel, marginBottom: 12, background: "#f0fdf4", color: "#166534" }}>{message}</div>}
    <section style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div><div style={{marginBottom:6}}>조회 월</div><div style={{display:"flex",gap:5,alignItems:"center"}}>
          <select aria-label="조회 연도" value={month.slice(0,4)} disabled={busy} onChange={e=>setMonth(e.target.value+month.slice(4))} style={field}>
            {Array.from({length:12},(_,i)=>Number(monthNow().slice(0,4))-i).map(year=><option key={year} value={year}>{year}년</option>)}
          </select>
          <select aria-label="조회 월" value={month.slice(5)} disabled={busy} onChange={e=>setMonth(month.slice(0,5)+e.target.value)} style={field}>
            {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={String(m).padStart(2,"0")}>{m}월</option>)}
          </select>
        </div></div>
        <button style={btn} disabled={loadingShows||busy} onClick={() => void loadShows()}>{loadingShows ? "조회 중..." : "방송 새로고침"}</button>
        <button type="button" style={{...btn,background:"#eff6ff",borderColor:"#93c5fd",color:"#1d4ed8"}} disabled={busy||loadingShows||!shows.length||shows.every(s=>videoIds.includes(s.video_id))} onClick={()=>setVideoIds([...new Set(shows.map(s=>s.video_id))])}>월 전체 선택 ({shows.length}회)</button>
        <label style={{ flex: 1, minWidth: 260 }}>방송 선택
          <select aria-label="방송 선택" value={videoId} style={{ ...field, display: "block", marginTop: 6, width: "100%" }} onChange={e => setVideoId(e.target.value)}>
            <option value="">방송을 선택해줘 ({shows.length}회)</option>
            {shows.map(s => <option key={s.video_id} value={s.video_id}>{kst(s.first_sale)} · {won(s.revenue)} · {s.count}건 · {s.buyer_count}명</option>)}
          </select>
        </label>
        <button style={btn} disabled={busy||loadingShows||!videoId || videoIds.includes(videoId)} onClick={() => setVideoIds(prev => [...prev, videoId])}>방송 추가</button>
        <button style={btn} disabled={busy||!videoIds.length || loadingSales} onClick={() => void loadSales(videoIds)}>{loadingSales ? "불러오는 중..." : "판매내역 갱신"}</button>
      </div>
      {videoIds.length > 0 && <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>조회 방송 {videoIds.length}개 · 합산 매출 {won(totalShowRevenue)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {selectedShows.map(show => <button key={show.video_id} type="button" disabled={busy} style={{ ...btn, background: "#eff6ff", borderColor: "#bfdbfe" }} onClick={() => setVideoIds(prev => prev.filter(id => id !== show.video_id))} title="조회 목록에서 제거">{kst(show.first_sale)} · {show.count}건 ×</button>)}
          <button type="button" style={btn} disabled={busy} onClick={() => setVideoIds([])}>전체 제거</button>
        </div>
      </div>}
    </section>

    {videoIds.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)", gap: 12, alignItems: "start" }}>
      <section style={panel}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><b style={{ fontSize: 17 }}>실제 판매기록</b><div style={{ fontSize: 12, color: "#64748b" }}>전체 {sales.length}건 · 실제 {sales.reduce((n,s)=>n+saleUnits(s.sale_units),0)}개 · 연결 {linkedCount}건 · 미연결 {sales.length - linkedCount}건</div><div style={{fontSize:12,color:"#64748b"}}>같은 방송 내 동일 상품만 묶어서 표시</div></div>
          <input aria-label="판매상품 검색" placeholder="상품명 / 판매가 검색" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} style={field} />
          <input aria-label="실제 판매가 검색" inputMode="numeric" placeholder="판매가 (예: 3700)" value={salePriceSearch} onChange={e=>setSalePriceSearch(e.target.value)} style={{...field,width:140}} />
          <select aria-label="판매목록 정렬" value={saleSort} onChange={e=>setSaleSort(e.target.value as typeof saleSort)} style={field}><option value="quantity">판매수량 많은순</option><option value="price_desc">판매가 높은순</option><option value="price_asc">판매가 낮은순</option></select>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={onlyUnlinked} onChange={e => setOnlyUnlinked(e.target.checked)} />미연결 포함만</label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button style={btn} onClick={() => changeSaleSelection(Object.fromEntries(filteredGroups.flatMap(g => g.items.map(row => [row.id, true]))))}>현재 목록 전체 선택</button>
          <button style={btn} onClick={() => changeSaleSelection({})}>선택 해제</button>
          <span style={{ fontSize: 12, color: "#475569" }}>선택 {selectedIds.length}건 · 실제 {selectedUnitTotal}개 · 대량 선택 자동 분할 저장</span>
          <label style={{fontSize:13,fontWeight:700}}>선택 건당 실제 판매 수량 <SaleUnitsEditor key={selectedIds.join(",")} units={commonUnits} disabled={busy||!selectedIds.length} bulk onSave={n=>editUnits(selectedIds,n)}/></label>
        </div>
        <div style={{ maxHeight: "68vh", overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}><tr><th style={th}>선택</th><th style={th}>상품군 · 판매가</th><th style={th}>수량</th><th style={th}>연결</th><th style={th}>상세</th></tr></thead>
            <tbody>{filteredGroups.map(g => <FragmentGroup key={g.key} group={g} selected={selected} expanded={Boolean(expanded[g.key])} onSelect={checked => setGroupSelection(g, checked)} onToggle={() => setExpanded(prev => ({ ...prev, [g.key]: !prev[g.key] }))} onSelectItem={(id, val) => changeSaleSelection(prev => ({ ...prev, [id]: val }))} candidateNames={candidateNames} busy={busy} onUnits={(id,n)=>editUnits([id],n)} onUnlink={(saleId, target) => { if (window.confirm("이 판매건에서 선택한 재고 연결만 해제할까?")) void save("unlink", { saleId, target }); }} />)}</tbody>
          </table>
          {!filteredGroups.length && <p style={{ textAlign: "center", color: "#64748b", padding: 16 }}>{loadingSales ? "판매기록을 불러오는 중..." : "표시할 판매기록이 없어."}</p>}
        </div>
      </section>

      <aside style={{ ...panel, position: "sticky", top: 10 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>연결할 방송판매재고</h2>
        <p style={{ fontSize: 12, color: "#64748b" }}>추천 순서: ① 수동분류 작품 (없으면 상품명 작품 추론) → ② 특징적인 상품명 키워드 (희소한 키워드 우선) → ③ 동일 상품 종류 → ④ 판매가 ±10% 근접 → ⑤ 잔여 재고 보유. 정확한 완판 상품도 우선 추천해.</p>
        <input aria-label="재고 검색" placeholder="재고명·작품명·매입일·판매가 검색" value={candidateSearch} onChange={e => setCandidateSearch(e.target.value)} style={{ ...field, width: "100%", boxSizing: "border-box" }} />
        <input aria-label="재고 등록 판매가 검색" inputMode="numeric" placeholder="등록 판매가 (예: 3700)" value={candidatePriceSearch} onChange={e=>setCandidatePriceSearch(e.target.value)} style={{...field,width:"100%",boxSizing:"border-box",marginTop:6}} />
        <div style={{ display: "flex", gap: 8, margin: "9px 0" }}>
          <select aria-label="재고 구분" value={candidateType} onChange={e => setCandidateType(e.target.value)} style={{ ...field, flex: 1 }}>
            <option value="all">전체 재고</option><option value="purchase_item">매입상품</option><option value="inventory_group">동일상품 묶음</option><option value="random_box">랜덤박스</option>
          </select>
          <button style={btn} onClick={() => void loadInventory()} disabled={loadingInventory}>{loadingInventory ? "조회 중" : "재고 갱신"}</button>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>후보 {candidates.length}개 · 목록은 최대 150개 표시</div>
        <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          {filteredCandidates.map(c => <div key={c.type + c.id} style={{display:"flex",alignItems:"center",gap:4,borderBottom:"1px solid #f1f5f9",background:targets[c.type+"|"+c.id]?"#eff6ff":"#fff"}}>
            <label style={{ display:"flex",gap:9,padding:9,alignItems:"center",flex:1,minWidth:0,cursor:"pointer" }}>
            <input type="checkbox" checked={Boolean(targets[c.type + "|" + c.id])} onChange={event => { const key = c.type + "|" + c.id; setTargets(prev => { const next = {...prev}; if (event.target.checked) next[key] = Object.keys(prev).length ? 1 : commonUnits; else delete next[key]; return next; }); }} />
            {c.image_url ? <img src={c.image_url} alt="" loading="lazy" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 5 }} /> : <span style={{ width: 48, height: 48, display: "grid", placeItems: "center", background: "#f1f5f9", borderRadius: 5, fontSize: 10 }}>사진 없음</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}><b>{c.name}</b><br />
              <span style={{ color: "#64748b" }}>{c.type === "random_box" ? "랜덤박스" : c.type==='inventory_group'?'묶음 재고':"매입상품"} · {c.option || c.series || "옵션 없음"}<br />{c.sale_price != null ? "판매가 " + won(c.sale_price) + " · " : c.reference_prices?.length ? "판매가 " + won(c.reference_prices[0]) + (c.reference_prices.length>1?"~"+won(c.reference_prices[c.reference_prices.length-1]):"") + " · " : ""}{c.type==='inventory_group'?'오래된 입고부터 차감':`${c.component_count}개 구성`} · 잔여 {c.remaining_units}개 {c.random_member?"· 랜덤박스 구성품(연결만 가능)":""}</span>{c.recommendation.reason&&<span style={{display:"block",color:"#166534",fontWeight:700}}>{c.recommendation.reason}</span>}
            </span>
            </label>
            <button type="button" title="이 재고의 판매 연결 보기/해제" aria-label={c.name+" 판매 연결 보기"} onClick={()=>openCandidateLinks(c)} style={{width:27,height:27,flexShrink:0,marginRight:7,border:"1px solid #e2e8f0",borderRadius:6,background:"#fff",fontSize:15,cursor:"pointer",padding:0}}>🔗</button>
          </div>)}
          {!filteredCandidates.length && <p style={{ fontSize: 13, color: "#64748b", padding: 12 }}>검색 결과가 없어.</p>}
        </div>
        {selectedTargets.length > 0 && <div style={{ padding: 10, background: "#eff6ff", fontSize: 13, marginTop: 10, borderRadius: 8 }}>
          <b>선택 재고 {selectedTargets.length}종 · 판매 {selectedIds.length}건</b>
          <p style={{margin:"6px 0",color:"#475569"}}>아래 수량은 판매 1건당 낱개 수량이야.</p>
          {selectedTargets.map(c => <div key={c.type + "|" + c.id} style={{ display: "flex", flexWrap:"wrap",alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8 }}>
            <span style={{ flex:1,overflowWrap:"anywhere",fontWeight:700 }}>{c.name} {c.option} · {c.component_count}종/개 구성</span>
            <button type="button" title="연결된 판매 목록 및 해제" aria-label={c.name+" 연결 목록"} onClick={()=>openCandidateLinks(c)} style={{width:26,height:26,border:"1px solid #bfdbfe",borderRadius:6,background:"#fff",cursor:"pointer",fontSize:15}}>🔗</button>
            <label style={{ whiteSpace: "nowrap" }}>건당 낱개 <input aria-label={c.name + " 판매 1건당 연결 수량"} type="number" min={1} max={9999} value={c.quantity} style={{ ...field, width: 65 }} onChange={e => { const quantity = Number(e.target.value); setTargets(prev => ({ ...prev, [c.type + "|" + c.id]: Number.isSafeInteger(quantity) && quantity >= 1 ? Math.min(quantity, 9999) : 1 })); }} /></label>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}><button type="button" style={{...btn,padding:"4px 6px"}} onClick={()=>setTargets(prev=>({...prev,[c.type+"|"+c.id]:c.component_count}))}>건당 1박스 ({c.component_count}개)</button>
            <button type="button" style={{...btn,padding:"4px 6px"}} disabled={!selectedIds.length||c.component_count%selectedIds.length!==0} title="선택 판매 건수로 한 박스를 균등하게 나눌 수 있을 때만 사용" onClick={()=>setTargets(prev=>({...prev,[c.type+"|"+c.id]:c.component_count/selectedIds.length}))}>선택 전체 1박스</button></div>
            <b style={{flex:"1 0 100%",color:"#1d4ed8"}}>{selectedIds.length}건 × {c.quantity}개 = 전체 {selectedIds.length*c.quantity}개 연결</b>
            <button type="button" style={btn} onClick={() => setTargets(prev => { const next = { ...prev }; delete next[c.type + "|" + c.id]; return next; })}>제거</button>
          </div>)}
        </div>}
        <div style={{display:"grid",gap:6,fontSize:12,padding:10,background:"#f8fafc",marginTop:10,borderRadius:8}}>
          <b>재고 반영 방식</b>
          <select value={deductionMode} onChange={e=>setDeductionMode(e.target.value as typeof deductionMode)} style={field}>
            <option value="future">신규 판매만 자동 차감 (과거 연결만)</option><option value="link_only">연결만 · 수량 변화 없음</option><option value="historical">과거 포함 실제 차감</option><option value="reset_reconcile">초기화한 재고 재정산 · 기존 연결 포함 차감</option>
          </select>
          {previews.map(({c,delta})=><div key={c.id} style={{color:delta>c.remaining_units?"#b91c1c":"#334155"}}><b>{c.name}</b><br/>{delta>c.remaining_units?"재고 부족: 잔여 "+c.remaining_units+"개 / 실제 차감 "+delta+"개 (부족 "+(delta-c.remaining_units)+"개)":"잔여 "+c.remaining_units+"개 → "+(c.remaining_units-delta)+"개 · "+(delta>0?"차감 "+delta+"개":delta<0?"복원 "+(-delta)+"개":"차감 없음")}</div>)}
          {deductionMode==="reset_reconcile"&&<div style={{color:"#92400e",fontWeight:700}}>수동 초기화한 재고용이야. 기존 연결도 재고풀로 이전하고 FIFO 차감해. 이전 차감이 실제로 초기화됐는지 확인한 후 처리해.</div>}
          <label><input type="checkbox" checked={remember&&canRemember} disabled={!canRemember} onChange={e=>setRemember(e.target.checked)}/> 같은 상품명·이미지·가격을 다음 판매부터 자동 연결 및 차감</label>
          {!canRemember&&<span style={{color:"#64748b"}}>한 상품군(이미지 포함)을 선택하면 자동 연결을 기억할 수 있어.</span>}
        </div>
        {error&&<div role="alert" style={{marginTop:10,padding:9,border:"1px solid #fca5a5",background:"#fef2f2",color:"#991b1b",fontSize:12,whiteSpace:"pre-wrap"}}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button style={{ ...btn, flex: 1, background: insufficient?"#94a3b8":"#1d4ed8", color: "#fff", borderColor: "#1d4ed8" }} disabled={busy || insufficient || selectedIds.length === 0 || selectedTargets.length === 0 || selectedTargets.length > 16} onClick={() => void save("link")}>{busy ? "저장 중..." : insufficient?"재고 부족":selectedIds.length + "건 · 전체 " + selectedTargets.reduce((s,c)=>s+c.quantity*selectedIds.length,0) + "개 연결"}</button>
          <button style={{ ...btn, color: "#991b1b" }} disabled={busy || selectedIds.length === 0} onClick={() => { if (window.confirm("선택한 실제 판매기록의 재고 연결만 해제할까?")) void save("unlink"); }}>연결 해제</button>
        </div>
        <p style={{ fontSize: 12, color: "#64748b" }}>기존 연결은 차감하지 않아. 차감한 연결을 해제하면 그 수량만 복원돼. 배송·실매출 원본은 변경하지 않아.</p>
      </aside>
    </div>}
    {linkView&&<div role="presentation" onClick={()=>!viewSaving&&setLinkView(null)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",display:"flex",alignItems:"center",justifyContent:"center",padding:12,zIndex:1000}}>
      <section role="dialog" aria-modal="true" aria-label="후보 재고 판매 연결 내역" onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:16,width:"min(760px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",gap:9}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <div><b>🔗 실판매 연결 내역</b><div style={{fontSize:12,color:"#64748b",marginTop:3}}>{linkView.name}</div></div>
          <button type="button" style={btn} disabled={viewSaving} onClick={()=>setLinkView(null)}>닫기</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:12}}>
          <span>연결 {viewLinks.length}건 · {viewLinks.reduce((n,r)=>n+Number(r.allocated_units||0),0)}개</span>
          <button type="button" style={btn} disabled={viewLoading||viewSaving} onClick={()=>void fetchCandidateLinks(linkView)}>새로고침</button>
          <label style={{display:"flex",gap:4,alignItems:"center",marginLeft:"auto"}}><input type="checkbox" checked={viewLinks.length>0&&viewChecked.length===viewLinks.length} onChange={e=>setViewChecked(e.target.checked?viewLinks.map(r=>Number(r.id)):[])} disabled={viewSaving||!viewLinks.length}/>전체 선택</label>
          <button type="button" style={{...btn,color:"#b91c1c"}} disabled={viewSaving||!viewChecked.length} onClick={()=>void unlinkCandidateLinks(viewChecked)}>선택 {viewChecked.length}건 해제</button>
        </div>
        <p style={{fontSize:11,color:"#64748b",margin:0}}>재고 연결만 해제해. 와이스 원본 판매 및 매출 기록은 유지해.</p>
        {viewError&&<p role="alert" style={{color:"#b91c1c",fontSize:12}}>{viewError}</p>}
        <div style={{overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,minHeight:60}}>
          {viewLoading?<p style={{padding:12}}>조회 중…</p>:!viewLinks.length?<p style={{padding:12,color:"#64748b"}}>연결된 판매가 없어.</p>:
            viewLinks.map(row=><div key={row.id} style={{display:"flex",alignItems:"center",gap:8,padding:9,borderBottom:"1px solid #f1f5f9",fontSize:12}}>
              <input type="checkbox" checked={viewChecked.includes(Number(row.id))} disabled={viewSaving} onChange={e=>setViewChecked(p=>e.target.checked?[...p,Number(row.id)]:p.filter(x=>x!==Number(row.id)))}/>
              {row.image_url&&<img src={row.image_url} alt="" style={{width:38,height:38,objectFit:"contain"}}/>}
              <div style={{flex:1,minWidth:0}}>
                <b>{row.item_name}</b>
                <div style={{color:"#64748b"}}>{row.buyer_nickname||"구매자 미확인"} · {row.sold_at?new Date(row.sold_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):"판매일 미확인"}</div>
                <div>판매가 {won(Number(row.item_price))} · 연결 {row.allocated_units}개 · 차감 {row.applied_units}개 · ID {row.wise_stock_id}{row.target_type==="inventory_group"?" · 재고풀 연결":""}</div>
              </div>
              <button type="button" style={{...btn,color:"#b91c1c"}} disabled={viewSaving} onClick={()=>void unlinkCandidateLinks([Number(row.id)])}>해제</button>
            </div>)}
        </div>
      </section>
    </div>}
    {videoIds.length === 0 && <section style={{ ...panel, color: "#64748b" }}>월 전체 선택 또는 개별 방송 추가로 실제 판매기록을 한 번에 불러와. 기존 매출관리 페이지는 추가 데이터를 불러오지 않아.</section>}
  </main>;
}

function FragmentGroup({ group, selected, expanded, onSelect, onToggle, onSelectItem, candidateNames, onUnlink, busy, onUnits }: {
  group: Family; selected: Record<string, boolean>; expanded: boolean;
  onSelect: (checked: boolean) => void; onToggle: () => void;
  onSelectItem: (id: string, value: boolean) => void;
  candidateNames: Map<string, string>;
  onUnlink: (saleId: string, target: LinkRow) => void;
  busy: boolean; onUnits:(id:string,n:number)=>Promise<void>;
}) {
  const checkedCount = group.items.filter(x => selected[x.id]).length;
  return <>
    <tr style={{ background: checkedCount > 0 ? "#eff6ff" : "#fff" }}>
      <td style={td}><input type="checkbox" aria-label={group.title + " 선택"} checked={checkedCount === group.count} ref={element => { if (element) element.indeterminate = checkedCount > 0 && checkedCount < group.count; }} onChange={e => onSelect(e.target.checked)} /></td>
      <td style={td}><div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {group.image ? <img src={group.image} alt="" loading="lazy" style={{ width: 42, height: 42, objectFit: "contain" }} /> : null}
        <span style={{ fontWeight: 700 }}>{group.title}<span style={{display:"block",fontSize:11,color:"#64748b",fontWeight:500}}>방송 {kst(group.broadcastAt)}</span>{group.items[0]?.manual_series&&<span style={{display:"block",fontSize:11,color:"#166534",fontWeight:700}}>수동 작품: {group.items[0].manual_series}</span>}</span>
      </div></td>
      <td style={td}>{group.count}건 · {group.items.reduce((n,s)=>n+saleUnits(s.sale_units),0)}개</td>
      <td style={{ ...td, color: group.linked === group.count ? "#15803d" : "#64748b" }}>{group.linked}/{group.count}</td>
      <td style={td}><button style={btn} onClick={onToggle}>{expanded ? "접기" : "펼치기"}</button></td>
    </tr>
    {expanded && <tr><td colSpan={5} style={{ padding: 10, background: "#f8fafc" }}>
      <div style={{ maxHeight: 330, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
          <th style={th}>선택</th><th style={th}>판매상품명</th><th style={th}>구매자</th><th style={th}>방송 / 판매시각</th><th style={th}>연결상태</th>
        </tr></thead><tbody>{group.items.map(row => <tr key={row.id}>
          <td style={td}><input type="checkbox" checked={Boolean(selected[row.id])} onChange={e => onSelectItem(row.id, e.target.checked)} /></td>
          <td style={td}>{row.item_name}<div style={{fontSize:12,color:"#475569"}}>총 {won(row.item_price)} · 개당 {won(row.item_price/saleUnits(row.sale_units))}</div><SaleUnitsEditor key={row.id+"-"+row.sale_units} units={saleUnits(row.sale_units)} disabled={busy} onSave={n=>onUnits(row.id,n)}/></td><td style={td}>{row.buyer_nickname}</td><td style={td}>{row.video_id} · {kst(row.sold_at)}</td>
          <td style={td}>{row.links?.length ? <div style={{ display: "grid", gap: 4 }}>{row.links.map(link => <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
            <span>{candidateNames.get(targetKey(link)) || "연결됨 · 재고 확인 필요"} × {link.quantity || 1} · {link.applied_units?`차감 ${link.applied_units}개`:"연결만"}</span>
            <button type="button" style={{ ...btn, color: "#991b1b", padding: "4px 7px" }} onClick={() => onUnlink(row.id, link)}>해제</button>
          </div>)}</div> : "미연결"}</td>
        </tr>)}</tbody></table>
      </div>
    </td></tr>}
  </>;
}
