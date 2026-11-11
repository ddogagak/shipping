"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type LinkRow = { wise_stock_id: number | string; purchase_item_id: string | null; random_box_id: string | null };
type Sale = { id: string; video_id: string; wise_user_id: string | null; buyer_nickname: string; item_name: string; item_price: number; image_url: string | null; sold_at: string | null; link: LinkRow | null };
type Show = { video_id: string; first_sale: string; last_sale: string; revenue: number; count: number; buyer_count: number };
type Candidate = { type: "purchase_item" | "random_box"; id: string; name: string; option: string; image_url: string | null; series: string; unit_price: number; currency: string; component_count: number; sale_price: number | null; stock_status: string; purchase_date: string };
type Family = { key: string; title: string; count: number; revenue: number; linked: number; image: string | null; items: Sale[] };

const panel: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 13, padding: 16, background: "#fff" };
const field: CSSProperties = { padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff", maxWidth: "100%" };
const btn: CSSProperties = { ...field, cursor: "pointer", fontWeight: 750, fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #e2e8f0", fontSize: 13, verticalAlign: "middle" };
const won = (n: number) => Math.round(n || 0).toLocaleString("ko-KR") + "원";
const kst = (s: string | null) => s ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const normalize = (s: string) => String(s || "").normalize("NFKC").toLowerCase().replace(/^\s*#\s*\d+\s*/, "").replace(/\s+/g, "").trim();
function familyOf(row: Sale) {
  const name = row.item_name.normalize("NFKC").replace(/^\s*#\s*\d+\s*/, "").trim();
  const key = normalize(row.item_name) + "|" + row.item_price;
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
function targetKey(row: LinkRow | null) {
  if (!row) return "";
  return row.purchase_item_id ? "purchase_item|" + row.purchase_item_id : row.random_box_id ? "random_box|" + row.random_box_id : "";
}
export default function WiseInventoryLinkPage() {
  const [month, setMonth] = useState(monthNow);
  const [shows, setShows] = useState<Show[]>([]);
  const [videoId, setVideoId] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [groupSearch, setGroupSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateType, setCandidateType] = useState("all");
  const [target, setTarget] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingShows, setLoadingShows] = useState(false);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadShows = useCallback(async () => {
    setLoadingShows(true); setError("");
    try {
      const data = await requestJson("/api/sales-management/sale-links?mode=shows&month=" + encodeURIComponent(month));
      setShows(data.shows || []);
      setVideoId("");
      setSales([]);
      setSelected({});
    } catch (e) { setError(e instanceof Error ? e.message : "방송 조회 실패"); }
    finally { setLoadingShows(false); }
  }, [month]);
  useEffect(() => { void loadShows(); }, [loadShows]);

  const loadSales = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingSales(true); setError("");
    try {
      const data = await requestJson("/api/sales-management/sale-links?mode=sales&video_id=" + encodeURIComponent(id));
      setSales(data.sales || []);
      setSelected({});
    } catch (e) { setError(e instanceof Error ? e.message : "판매기록 조회 실패"); }
    finally { setLoadingSales(false); }
  }, []);
  useEffect(() => { if (videoId) void loadSales(videoId); }, [videoId, loadSales]);

  const loadInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      const data = await requestJson("/api/sales-management/sale-links?mode=inventory");
      setCandidates(data.candidates || []);
    } catch (e) { setError(e instanceof Error ? e.message : "재고 조회 실패"); }
    finally { setLoadingInventory(false); }
  }, []);
  useEffect(() => { void loadInventory(); }, [loadInventory]);

  const familyGroups = useMemo(() => {
    const map = new Map<string, Family>();
    for (const row of sales) {
      const { key, name } = familyOf(row);
      const g = map.get(key) || { key, title: name + " · " + won(row.item_price), count: 0, revenue: 0, linked: 0, image: row.image_url || null, items: [] };
      g.count += 1;
      g.revenue += row.item_price;
      g.linked += row.link ? 1 : 0;
      g.image ||= row.image_url;
      g.items.push(row);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  }, [sales]);
  const filteredGroups = useMemo(() => familyGroups.filter(g =>
    (!onlyUnlinked || g.linked < g.count) && (!groupSearch || g.title.toLowerCase().includes(groupSearch.trim().toLowerCase()))
  ), [familyGroups, groupSearch, onlyUnlinked]);
  const filteredCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    return candidates.filter(c => (candidateType === "all" || c.type === candidateType) &&
      (!query || [c.name, c.option, c.series, c.purchase_date].some(v => String(v || "").toLowerCase().includes(query))))
      .slice(0, 150);
  }, [candidateSearch, candidates, candidateType]);
  const selectedIds = useMemo(() => sales.filter(s => selected[s.id]).map(s => s.id), [sales, selected]);
  const linkedCount = useMemo(() => sales.filter(s => s.link).length, [sales]);
  const currentTarget = useMemo(() => candidates.find(c => c.type + "|" + c.id === target), [candidates, target]);
  const setGroupSelection = (family: Family, checked: boolean) => {
    setSelected(prev => {
      const next = { ...prev };
      for (const row of family.items) next[row.id] = checked;
      return next;
    });
  };
  async function save(action: "link" | "unlink", overwrite = false) {
    if (!videoId || !selectedIds.length || busy) return;
    if (action === "link" && !currentTarget) { setError("먼저 오른쪽에서 연결할 방송판매재고를 골라줘."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const body = { action, stock_ids: selectedIds, overwrite, target_type: currentTarget?.type, target_id: currentTarget?.id };
      const data = await requestJson("/api/sales-management/sale-links", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      setMessage(data.count + "개 실제 판매기록 " + (action === "link" ? "연결" : "연결 해제") + " 완료. 원본 매출·재고 수량은 변경되지 않았어.");
      await loadSales(videoId);
    } catch (e) {
      const typed = e as Error & { conflict?: boolean };
      if (typed.conflict && action === "link" && !overwrite && window.confirm(typed.message + "\n기존 연결을 덮어쓸까?")) {
        try {
          const retried = await requestJson("/api/sales-management/sale-links", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "link", stock_ids: selectedIds, overwrite: true, target_type: currentTarget?.type, target_id: currentTarget?.id })
          });
          setMessage(retried.count + "개 실제 판매기록 연결 완료. 기존 연결만 교체했어.");
          await loadSales(videoId);
        } catch (retryError) {
          setError(retryError instanceof Error ? retryError.message : "연결 덮어쓰기 실패");
        }
        return;
      }
      setError(e instanceof Error ? e.message : "매칭 저장 실패");
    } finally { setBusy(false); }
  }
  const show = shows.find(s => s.video_id === videoId);
  return <main style={{ padding: 22, maxWidth: 1480, margin: "0 auto", color: "#0f172a", fontFamily: "inherit" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <div><h1 style={{ margin: 0, fontSize: 28 }}>실판매 ↔ 방송판매재고 연결</h1>
        <p style={{ color: "#64748b", margin: "8px 0 0", fontSize: 14 }}>실제 판매기록을 나중에 재고와 연결하는 독립 관리 페이지 · 매출·재고 차감 없음</p></div>
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
        <label>조회 월 <input aria-label="조회 월" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...field, display: "block", marginTop: 6 }} /></label>
        <button style={btn} disabled={loadingShows} onClick={() => void loadShows()}>{loadingShows ? "조회 중..." : "방송 새로고침"}</button>
        <label style={{ flex: 1, minWidth: 260 }}>방송 선택
          <select aria-label="방송 선택" value={videoId} style={{ ...field, display: "block", marginTop: 6, width: "100%" }} onChange={e => setVideoId(e.target.value)}>
            <option value="">방송을 선택해줘 ({shows.length}회)</option>
            {shows.map(s => <option key={s.video_id} value={s.video_id}>{kst(s.first_sale)} · {won(s.revenue)} · {s.count}개 · {s.buyer_count}명</option>)}
          </select>
        </label>
        <button style={btn} disabled={!videoId || loadingSales} onClick={() => void loadSales(videoId)}>{loadingSales ? "불러오는 중..." : "판매내역 갱신"}</button>
      </div>
      {show && <p style={{ fontSize: 13, color: "#475569", marginBottom: 0 }}>선택 방송: {kst(show.first_sale)} ~ {kst(show.last_sale)} / 판매 {show.count}개 / {won(show.revenue)}</p>}
    </section>

    {videoId && <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)", gap: 12, alignItems: "start" }}>
      <section style={panel}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><b style={{ fontSize: 17 }}>실제 판매기록</b><div style={{ fontSize: 12, color: "#64748b" }}>전체 {sales.length}개 · 연결 {linkedCount}개 · 미연결 {sales.length - linkedCount}개</div></div>
          <input aria-label="판매상품 검색" placeholder="판매상품 이름 검색" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} style={field} />
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={onlyUnlinked} onChange={e => setOnlyUnlinked(e.target.checked)} />미연결 포함만</label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button style={btn} onClick={() => setSelected(Object.fromEntries(filteredGroups.flatMap(g => g.items.map(row => [row.id, true]))))}>현재 목록 전체 선택</button>
          <button style={btn} onClick={() => setSelected({})}>선택 해제</button>
          <span style={{ fontSize: 12, color: "#475569" }}>선택 {selectedIds.length}개 · 300개까지 한 번에 저장</span>
        </div>
        <div style={{ maxHeight: "68vh", overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}><tr><th style={th}>선택</th><th style={th}>상품군 · 판매가</th><th style={th}>수량</th><th style={th}>연결</th><th style={th}>상세</th></tr></thead>
            <tbody>{filteredGroups.map(g => <FragmentGroup key={g.key} group={g} selected={selected} expanded={Boolean(expanded[g.key])} onSelect={checked => setGroupSelection(g, checked)} onToggle={() => setExpanded(prev => ({ ...prev, [g.key]: !prev[g.key] }))} onSelectItem={(id, val) => setSelected(prev => ({ ...prev, [id]: val }))} />)}</tbody>
          </table>
          {!filteredGroups.length && <p style={{ textAlign: "center", color: "#64748b", padding: 16 }}>{loadingSales ? "판매기록을 불러오는 중..." : "표시할 판매기록이 없어."}</p>}
        </div>
      </section>

      <aside style={{ ...panel, position: "sticky", top: 10 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>연결할 방송판매재고</h2>
        <p style={{ fontSize: 12, color: "#64748b" }}>실판매를 체크하고 아래에서 재고를 하나 선택해 연결해줘. 여러 판매항목을 같은 재고에 연결할 수 있어.</p>
        <input aria-label="재고 검색" placeholder="재고명·작품명·매입일 검색" value={candidateSearch} onChange={e => setCandidateSearch(e.target.value)} style={{ ...field, width: "100%", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 8, margin: "9px 0" }}>
          <select aria-label="재고 구분" value={candidateType} onChange={e => setCandidateType(e.target.value)} style={{ ...field, flex: 1 }}>
            <option value="all">전체 재고</option><option value="purchase_item">매입상품</option><option value="random_box">랜덤박스</option>
          </select>
          <button style={btn} onClick={() => void loadInventory()} disabled={loadingInventory}>{loadingInventory ? "조회 중" : "재고 갱신"}</button>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>후보 {candidates.length}개 · 목록은 최대 150개 표시</div>
        <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          {filteredCandidates.map(c => <label key={c.type + c.id} style={{ display: "flex", gap: 9, padding: 9, alignItems: "center", borderBottom: "1px solid #f1f5f9", background: target === c.type + "|" + c.id ? "#eff6ff" : "#fff", cursor: "pointer" }}>
            <input type="radio" name="target" checked={target === c.type + "|" + c.id} onChange={() => setTarget(c.type + "|" + c.id)} />
            {c.image_url ? <img src={c.image_url} alt="" loading="lazy" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 5 }} /> : <span style={{ width: 48, height: 48, display: "grid", placeItems: "center", background: "#f1f5f9", borderRadius: 5, fontSize: 10 }}>사진 없음</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}><b>{c.name}</b><br />
              <span style={{ color: "#64748b" }}>{c.type === "random_box" ? "랜덤박스" : "매입상품"} · {c.option || c.series || "옵션 없음"}<br />{c.sale_price != null ? "판매가 " + won(c.sale_price) + " · " : ""}{c.component_count}개 구성 · {c.stock_status}</span>
            </span>
          </label>)}
          {!filteredCandidates.length && <p style={{ fontSize: 13, color: "#64748b", padding: 12 }}>검색 결과가 없어.</p>}
        </div>
        {currentTarget && <div style={{ padding: 10, background: "#eff6ff", fontSize: 13, marginTop: 10, borderRadius: 8 }}><b>선택 재고:</b> {currentTarget.name} {currentTarget.option}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button style={{ ...btn, flex: 1, background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" }} disabled={busy || selectedIds.length === 0 || selectedIds.length > 300 || !currentTarget} onClick={() => void save("link")}>{busy ? "저장 중..." : selectedIds.length + "개 연결 저장"}</button>
          <button style={{ ...btn, color: "#991b1b" }} disabled={busy || selectedIds.length === 0 || selectedIds.length > 300} onClick={() => { if (window.confirm("선택한 실제 판매기록의 재고 연결만 해제할까?")) void save("unlink"); }}>연결 해제</button>
        </div>
        <p style={{ fontSize: 12, color: "#64748b" }}>연결은 이 별도 테이블에만 저장돼. 재고 수량·배송 상태·실판매 금액·매입 상태는 바뀌지 않아.</p>
      </aside>
    </div>}
    {!videoId && <section style={{ ...panel, color: "#64748b" }}>위에서 방송을 하나 선택하면 그 방송의 실제 판매기록만 불러와. 기존 매출관리 페이지는 추가 데이터를 불러오지 않아.</section>}
  </main>;
}

function FragmentGroup({ group, selected, expanded, onSelect, onToggle, onSelectItem }: {
  group: Family; selected: Record<string, boolean>; expanded: boolean;
  onSelect: (checked: boolean) => void; onToggle: () => void;
  onSelectItem: (id: string, value: boolean) => void
}) {
  const checkedCount = group.items.filter(x => selected[x.id]).length;
  return <>
    <tr style={{ background: checkedCount > 0 ? "#eff6ff" : "#fff" }}>
      <td style={td}><input type="checkbox" aria-label={group.title + " 선택"} checked={checkedCount === group.count} ref={element => { if (element) element.indeterminate = checkedCount > 0 && checkedCount < group.count; }} onChange={e => onSelect(e.target.checked)} /></td>
      <td style={td}><div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {group.image ? <img src={group.image} alt="" loading="lazy" style={{ width: 42, height: 42, objectFit: "contain" }} /> : null}
        <span style={{ fontWeight: 700 }}>{group.title}</span>
      </div></td>
      <td style={td}>{group.count}개</td>
      <td style={{ ...td, color: group.linked === group.count ? "#15803d" : "#64748b" }}>{group.linked}/{group.count}</td>
      <td style={td}><button style={btn} onClick={onToggle}>{expanded ? "접기" : "펼치기"}</button></td>
    </tr>
    {expanded && <tr><td colSpan={5} style={{ padding: 10, background: "#f8fafc" }}>
      <div style={{ maxHeight: 330, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
          <th style={th}>선택</th><th style={th}>판매상품명</th><th style={th}>구매자</th><th style={th}>판매시각</th><th style={th}>연결상태</th>
        </tr></thead><tbody>{group.items.map(row => <tr key={row.id}>
          <td style={td}><input type="checkbox" checked={Boolean(selected[row.id])} onChange={e => onSelectItem(row.id, e.target.checked)} /></td>
          <td style={td}>{row.item_name}</td><td style={td}>{row.buyer_nickname}</td><td style={td}>{kst(row.sold_at)}</td>
          <td style={td}>{targetKey(row.link) ? "연결됨" : "미연결"}</td>
        </tr>)}</tbody></table>
      </div>
    </td></tr>}
  </>;
}
