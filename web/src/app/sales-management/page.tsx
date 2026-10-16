"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

type SaleRow = { id: string; order_id: string; item_name: string; item_price: number; buyer_nickname: string; ordered_at: string };
type Buyer = { buyer_nickname: string; sales: number; order_count: number; item_count: number };
type Period = { key: string; sales: number; order_count: number; item_count: number; sales_rows: SaleRow[] };
type ItemPref = { includeCost: boolean; memo: string; deleted?: boolean };
type ItemSettings = { id: string; includeCost: boolean; memo: string; deleted: boolean };
type Report = { monthly: Period[]; quarterly: Period[]; all_time_sales_rows: SaleRow[]; excluded_item_count: number; included_order_count: number; included_item_count: number; imported_order_count: number; last_imported_at: string | null; wise_gross_total: number; settings: { cumulative_settled_amount: number; excluded_keywords: string[]; item_settings: ItemSettings[] } };
type StockItem = { display_name?: string; product_name?: string; option_text?: string; ordered_at?: string; purchase_quantity?: number; component_count?: number; unit_cost_price?: number; box_cost_price?: number };
type ItemPrefs = Record<string, ItemPref>;
const money = (value: number) => Math.round(Number(value || 0)).toLocaleString("ko-KR");
const itemKey = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const pageStyle: CSSProperties = { maxWidth: 1380, margin: "0 auto", padding: 24, color: "#111827" };
const button: CSSProperties = { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", textDecoration: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const card: CSSProperties = { padding: 18, border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", minHeight: 110 };
const label: CSSProperties = { color: "#6b7280", fontSize: 13, fontWeight: 700 };
const value: CSSProperties = { display: "block", marginTop: 10, fontSize: 26, fontWeight: 850, letterSpacing: "-.04em" };
const th: CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", whiteSpace: "nowrap", textAlign: "left" };
const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
const panel: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff", marginBottom: 16 };
const panelTitle: CSSProperties = { padding: "14px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 800 };
const chip: CSSProperties = { padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#f9fafb", color: "#4b5563", fontSize: 12, display: "inline-flex", alignItems: "center" };

function periodLabel(key: string) {
  if (key.includes("-Q")) return key.replace("-Q", "년 ").concat("분기");
  return key.replace("-", "년 ") + "월";
}
function kstDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(value));
}
function stockPeriodKey(value: string | undefined, granularity: "month" | "quarter") {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return granularity === "month"
    ? day.slice(0, 7)
    : day.slice(0, 4) + "-Q" + (Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1);
}
function buildCostIndex(items: StockItem[]) {
  const groups = new Map<string, { cost: number; weight: number }>();
  for (const row of items) {
    const unitCost = Number(row.unit_cost_price || 0);
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    const candidates = new Set<string>();
    const display = String(row.display_name || "").trim();
    const product = String(row.product_name || "").trim();
    const option = String(row.option_text || "").trim();
    if (display) candidates.add(display);
    if (product) candidates.add(product);
    if (product && option) candidates.add(product + " " + option);
    if (display && option && !display.includes(option)) candidates.add(display + " " + option);
    const weight = Math.max(1, Number(row.purchase_quantity || 0) * Math.max(1, Number(row.component_count || 1)));
    for (const candidate of candidates) {
      const key = itemKey(candidate);
      if (!key) continue;
      const group = groups.get(key) || { cost: 0, weight: 0 };
      group.cost += unitCost * weight;
      group.weight += weight;
      groups.set(key, group);
    }
  }
  return new Map(Array.from(groups, ([key, group]) => [key, group.cost / group.weight]));
}
function visibleRows(rows: SaleRow[], prefs: ItemPrefs) {
  return (rows || []).filter(row => !prefs[row.id]?.deleted);
}
function summarizeRows(rows: SaleRow[], prefs: ItemPrefs) {
  const visible = visibleRows(rows, prefs);
  return { sales: visible.reduce((sum, row) => sum + Number(row.item_price || 0), 0), item_count: visible.length, order_count: new Set(visible.map(row => row.order_id)).size };
}
function buyersFromRows(rows: SaleRow[], prefs: ItemPrefs): Buyer[] {
  const map = new Map<string, { sales: number; orderIds: Set<string>; item_count: number }>();
  for (const row of visibleRows(rows, prefs)) {
    const name = String(row.buyer_nickname || "").trim() || "(닉네임 없음)";
    const buyer = map.get(name) || { sales: 0, orderIds: new Set<string>(), item_count: 0 };
    buyer.sales += Number(row.item_price || 0);
    buyer.orderIds.add(row.order_id);
    buyer.item_count++;
    map.set(name, buyer);
  }
  return Array.from(map, ([buyer_nickname, row]) => ({ buyer_nickname, sales: row.sales, order_count: row.orderIds.size, item_count: row.item_count })).sort((a, b) => b.sales - a.sales);
}
function cleanPrefs(value: unknown): ItemPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ItemPrefs = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    result[key] = { includeCost: row.includeCost !== false, memo: String(row.memo || ""), deleted: row.deleted === true };
  }
  return result;
}

export default function SalesManagementPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [savedPrefs, setSavedPrefs] = useState<ItemPrefs>({});
  const [draftPrefs, setDraftPrefs] = useState<ItemPrefs>({});
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<"month" | "quarter">("month");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [settledAmount, setSettledAmount] = useState(0);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [salesResponse, stockResponse] = await Promise.all([
        fetch("/api/sales-management", { cache: "no-store" }),
        fetch("/api/sale-inventory", { cache: "no-store" }),
      ]);
      const [salesData, stockData] = await Promise.all([salesResponse.json(), stockResponse.json()]);
      if (!salesResponse.ok || !salesData.ok) throw new Error(salesData.message || "매출 자료를 불러오지 못했습니다.");
      if (!stockResponse.ok || !stockData.ok) throw new Error(stockData.message || "방송판매재고 원가를 불러오지 못했습니다.");
      setReport(salesData);
      setInventory(Array.isArray(stockData.items) ? stockData.items : []);
      const amount = Number(salesData.settings?.cumulative_settled_amount || 0);
      setSettledAmount(amount);
      setKeywords(Array.isArray(salesData.settings?.excluded_keywords) ? salesData.settings.excluded_keywords : []);
      const prefs: ItemPrefs = {};
      for (const row of salesData.settings?.item_settings || []) prefs[String(row.id)] = { includeCost: row.includeCost !== false, memo: String(row.memo || ""), deleted: row.deleted === true };
      setSavedPrefs(prefs);
      setDraftPrefs(prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const periods = useMemo(() => granularity === "month" ? report?.monthly || [] : report?.quarterly || [], [granularity, report]);
  const selectedKey = periods.some(p => p.key === selectedPeriod) ? selectedPeriod : periods[0]?.key || "";
  const rawCurrent = periods.find(p => p.key === selectedKey);
  const currentRows = useMemo(() => visibleRows(rawCurrent?.sales_rows || [], savedPrefs), [rawCurrent, savedPrefs]);
  const currentSummary = useMemo(() => summarizeRows(rawCurrent?.sales_rows || [], savedPrefs), [rawCurrent, savedPrefs]);
  const currentBuyers = useMemo(() => buyersFromRows(rawCurrent?.sales_rows || [], savedPrefs), [rawCurrent, savedPrefs]);
  const allTimeBuyers = useMemo(() => buyersFromRows(report?.all_time_sales_rows || [], savedPrefs), [report, savedPrefs]);
  const allTimeByBuyer = useMemo(() => new Map(allTimeBuyers.map(buyer => [buyer.buyer_nickname, buyer])), [allTimeBuyers]);
  const costIndex = useMemo(() => buildCostIndex(inventory), [inventory]);
  const itemRows = useMemo(() => currentRows.map(row => {
    const key = row.id;
    const unitCost = costIndex.get(itemKey(row.item_name));
    const includeCost = draftPrefs[key]?.includeCost !== false;
    return { ...row, key, unitCost: unitCost ?? null, includeCost, memo: draftPrefs[key]?.memo || "", cost: includeCost && unitCost != null ? unitCost : null };
  }), [currentRows, costIndex, draftPrefs]);
  const knownCost = itemRows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const unmatchedQuantity = itemRows.reduce((sum, row) => sum + (row.includeCost && row.unitCost == null ? 1 : 0), 0);
  const currentInventoryRows = inventory.filter(row => selectedKey && stockPeriodKey(row.ordered_at, granularity) === selectedKey);
  const currentInventoryCost = currentInventoryRows.reduce((sum, row) => {
    const boxCost = Number(row.box_cost_price || 0) || Number(row.unit_cost_price || 0) * Math.max(1, Number(row.component_count || 1));
    return sum + (Number.isFinite(boxCost) ? boxCost : 0) * Math.max(0, Number(row.purchase_quantity || 0));
  }, 0);
  const grossAfterCogs = currentSummary.sales - currentInventoryCost;
  const allRowsById = useMemo(() => new Map((report?.all_time_sales_rows || []).map(row => [row.id, row])), [report]);
  const deletedItems = Object.entries(savedPrefs).filter(([, pref]) => pref.deleted);
  const hasUnsaved = JSON.stringify(savedPrefs) !== JSON.stringify(draftPrefs);
  const expectedSettlement = Math.round(Number(report?.wise_gross_total || 0) * 0.94 - settledAmount);

  const saveKeywords = async (next: string[]) => {
    const unique = Array.from(new Set(next.map(x => x.normalize("NFKC").trim()).filter(Boolean))).slice(0, 100);
    try {
      const response = await fetch("/api/sales-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excluded_keywords: unique }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "키워드 저장에 실패했습니다.");
      setKeywords(unique);
      setNotice("제외 키워드를 DB에 저장했습니다.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "키워드 저장에 실패했습니다."); }
  };
  const addKeyword = (event: FormEvent) => {
    event.preventDefault();
    const term = keywordInput.normalize("NFKC").trim();
    if (!term || keywords.some(x => x.toLowerCase() === term.toLowerCase())) return;
    setKeywordInput("");
    void saveKeywords([...keywords, term]);
  };
  const importWiseSettlement = () => {
    setError("");
    setNotice("와이스에서 누적 정산금액을 불러오는 중입니다.");
    const popup = window.open("https://wyyyes.com/expected-settlement-amount", "ddoga-wise-settlement", "popup=yes,width=1050,height=850");
    if (!popup) { setError("팝업이 차단됐습니다. ddoga.lol 팝업을 허용해 주세요."); return; }
    setSettlementLoading(true);
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", receive);
      window.clearTimeout(timeout);
      setSettlementLoading(false);
    };
    const receive = async (event: MessageEvent) => {
      if (event.origin !== "https://wyyyes.com" || event.source !== popup || event.data?.type !== "DDOGA_WISE_SETTLEMENT_AMOUNT") return;
      const amount = Number(event.data.amount);
      if (!Number.isFinite(amount) || amount < 0) { cleanup(); setError("와이스에서 받은 정산금액이 올바르지 않습니다."); return; }
      cleanup();
      popup.close();
      try {
        const response = await fetch("/api/sales-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cumulative_settled_amount: amount }) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || "정산금액 저장에 실패했습니다.");
        setSettledAmount(Number(data.settings.cumulative_settled_amount));
        setNotice("와이스 누적 정산금액 " + money(amount) + "원을 가져와 저장했습니다.");
      } catch (e) { setError(e instanceof Error ? e.message : "정산금액 저장에 실패했습니다."); }
    };
    window.addEventListener("message", receive);
    const timeout = window.setTimeout(() => { cleanup(); setError("금액을 읽지 못했습니다. 와이스 로그인 상태와 정산 페이지를 확인해 주세요."); }, 90000);
  };
  const updateDraft = (key: string, patch: Partial<ItemPref>) => {
    setDraftPrefs(current => ({ ...current, [key]: { includeCost: current[key]?.includeCost !== false, memo: current[key]?.memo || "", deleted: current[key]?.deleted === true, ...patch } }));
  };
  const applyToSelected = (patch: Partial<ItemPref>) => {
    if (!selectedItems.length) return;
    setDraftPrefs(current => {
      const next = { ...current };
      for (const key of selectedItems) next[key] = { includeCost: next[key]?.includeCost !== false, memo: next[key]?.memo || "", deleted: next[key]?.deleted === true, ...patch };
      return next;
    });
    if (patch.deleted) setSelectedItems([]);
  };
  const saveItemSettings = async () => {
    setSaving(true);
    try {
      const normalized = cleanPrefs(draftPrefs);
      const item_settings = Object.entries(normalized).map(([id, row]) => ({ id, includeCost: row.includeCost, memo: row.memo, deleted: row.deleted === true }));
      const response = await fetch("/api/sales-management", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_settings }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "아이템 설정 저장에 실패했습니다.");
      setSavedPrefs(normalized);
      setDraftPrefs(normalized);
      setSelectedItems([]);
      setNotice("아이템 설정과 메모를 DB에 저장했습니다.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "아이템 설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const toggleSelected = (key: string) => setSelectedItems(current => current.includes(key) ? current.filter(x => x !== key) : [...current, key]);

  return <main style={pageStyle}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0, fontSize: 30 }}>매출관리</h1><p style={{ color: "#6b7280", margin: "6px 0 0" }}>와이스 판매와 방송판매재고 원가를 월별·분기별로 확인합니다.</p></div>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" style={button}>메인</Link><Link href="/purchases" style={button}>매입관리</Link><Link href="/sale-inventory" style={button}>방송판매재고</Link><Link href="/domestic-upload" style={button}>와이스 주문 동기화</Link>
      </nav>
    </header>

    <section style={{ padding: 16, marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <div style={{ fontWeight: 800, marginBottom: 5 }}>제외할 와이스 아이템 키워드</div>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 12 }}>키워드의 ×로 삭제, 아래에서 추가할 수 있습니다. 기본 키워드도 삭제할 수 있고 설정은 DB에 저장됩니다.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {keywords.map(term => <span key={term} style={chip}>{term}<button aria-label={term + " 키워드 삭제"} onClick={() => void saveKeywords(keywords.filter(x => x !== term))} style={{ border: 0, background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 900, marginLeft: 5 }}>×</button></span>)}
        {!keywords.length && <span style={{ color: "#9ca3af", fontSize: 12 }}>제외 키워드가 없습니다.</span>}
      </div>
      <form onSubmit={addKeyword} style={{ display: "flex", gap: 8, maxWidth: 520 }}>
        <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="제외할 키워드 추가" style={{ flex: 1, minWidth: 0, height: 36, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
        <button type="submit" style={button}>키워드 추가</button>
      </form>
    </section>

    <section style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => setGranularity("month")} style={{ ...button, background: granularity === "month" ? "#111827" : "#fff", color: granularity === "month" ? "#fff" : "#111827" }}>월별</button>
      <button onClick={() => setGranularity("quarter")} style={{ ...button, background: granularity === "quarter" ? "#111827" : "#fff", color: granularity === "quarter" ? "#fff" : "#111827" }}>분기별</button>
      <select aria-label="기간 선택" value={selectedKey} onChange={e => setSelectedPeriod(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 700 }}>
        {periods.map(p => <option value={p.key} key={p.key}>{periodLabel(p.key)}</option>)}
      </select>
    </section>

    {notice && <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 13 }}>{notice}</div>}
    {error && <div role="alert" style={{ padding: 14, marginBottom: 16, borderRadius: 10, background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }}>{error}</div>}
    {loading && <p style={{ color: "#6b7280" }}>불러오는 중...</p>}

    {!loading && !error && report && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <article style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}><span style={label}>매출 · {selectedKey ? periodLabel(selectedKey) : "선택 기간"}</span><strong style={{ ...value, color: "#1d4ed8" }}>{money(currentSummary.sales)}원</strong><small style={{ color: "#6b7280" }}>필터·삭제 적용 · 주문 {money(currentSummary.order_count)}건</small></article>
        <article style={card}><span style={label}>방송판매재고 매입금액 · {selectedKey ? periodLabel(selectedKey) : "선택 기간"}</span><strong style={value}>{money(currentInventoryCost)}원</strong><small style={{ color: "#6b7280" }}>입고완료 주문의 상품 행 {money(currentInventoryRows.length)}건 · 숨김/판매완료 포함</small></article>
        <article style={{ ...card, background: "#f0fdf4", borderColor: "#bbf7d0" }}><span style={label}>매출 − 방송재고 매입금액</span><strong style={{ ...value, color: grossAfterCogs >= 0 ? "#15803d" : "#b91c1c" }}>{money(grossAfterCogs)}원</strong><small style={{ color: "#6b7280" }}>선택 기간 매출에서 전체 방송재고 매입액을 뺀 금액</small></article>
        <article style={{ ...card, background: "#f8fafc" }}><span style={label}>와이스 전체 판매금액 · 누적</span><strong style={value}>{money(Number(report.wise_gross_total || 0))}원</strong><small style={{ color: "#6b7280" }}>배송비·키워드·아이템 삭제·원가토글 적용 전 전체</small></article>
        <article style={{ ...card, background: "#fff7ed", borderColor: "#fed7aa" }}><span style={label}>누적 정산예정액</span><strong style={{ ...value, color: "#c2410c" }}>{money(expectedSettlement)}원</strong><small style={{ color: "#6b7280" }}>전체 판매금액 × 0.94 − 누적 정산금액</small></article>
        <article style={card}>
          <span style={label}>누적 정산금액 · 와이스 연동</span>
          <strong style={{ ...value, fontSize: 21 }}>{money(settledAmount)}원</strong>
          <button type="button" onClick={importWiseSettlement} disabled={settlementLoading} style={{ ...button, marginTop: 9 }}>{settlementLoading ? "와이스 확인 중..." : "와이스에서 금액 가져오기"}</button>
        </article>
      </section>

      <section style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 14px", margin: "14px 0 20px", background: "#f9fafb", borderRadius: 10, color: "#4b5563", fontSize: 12 }}>
        <span>가져온 와이스 주문 {money(Number(report.imported_order_count || 0))}건</span><span>집계 주문 {money(currentSummary.order_count)}건</span><span>키워드 제외 아이템 {money(Number(report.excluded_item_count || 0))}개</span><span>마지막 동기화 {kstDate(report.last_imported_at)}</span>
      </section>

      <section style={panel}>
        <div style={panelTitle}>{granularity === "month" ? "월별" : "분기별"} 실적</div>
        {periods.length === 0 ? <div style={{ padding: 24, color: "#6b7280" }}>표시할 자료가 없습니다. 와이스 주문을 동기화해 주세요.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}>기간</th><th style={th}>매출</th><th style={th}>주문</th><th style={th}>판매수량</th><th style={th}>선택</th></tr></thead>
            <tbody>{periods.map(p => { const vis = summarizeRows(p.sales_rows, savedPrefs); return <tr key={p.key} onClick={() => setSelectedPeriod(p.key)} style={{ cursor: "pointer", background: p.key === selectedKey ? "#eff6ff" : "#fff" }}><td style={td}><b>{periodLabel(p.key)}</b></td><td style={td}>{money(vis.sales)}원</td><td style={td}>{money(vis.order_count)}건</td><td style={td}>{money(vis.item_count)}개</td><td style={td}>{p.key === selectedKey ? "●" : ""}</td></tr>; })}</tbody>
          </table></div>}
      </section>

      <section style={panel}>
        <div style={{ ...panelTitle, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>{selectedKey ? periodLabel(selectedKey) : "선택 기간"} 판매 내역</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={button} disabled={!selectedItems.length} onClick={() => applyToSelected({ deleted: true })}>삭제</button>
            <button style={button} disabled={!selectedItems.length} onClick={() => applyToSelected({ includeCost: true })}>판매원가에 포함</button>
            <button style={button} disabled={!selectedItems.length} onClick={() => applyToSelected({ includeCost: false })}>판매원가 제외</button>
            <button style={{ ...button, background: "#111827", color: "#fff" }} disabled={!hasUnsaved || saving} onClick={saveItemSettings}>{saving ? "저장 중..." : "저장"}</button>
          </div>
        </div>
        {hasUnsaved && <div style={{ padding: "8px 14px", background: "#fffbeb", color: "#92400e", fontSize: 12 }}>저장되지 않은 원가 설정·삭제·메모가 있습니다.</div>}
        {!itemRows.length ? <div style={{ padding: 24, color: "#6b7280" }}>이 기간의 판매 내역이 없습니다.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1240, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}><input aria-label="현재 판매 내역 전체 선택" type="checkbox" checked={itemRows.length > 0 && itemRows.every(row => selectedItems.includes(row.key))} onChange={e => setSelectedItems(e.target.checked ? itemRows.map(row => row.key) : [])} /></th><th style={th}>판매 날짜</th><th style={th}>구매자 닉네임</th><th style={th}>아이템</th><th style={th}>판매가</th><th style={th}>판매원가 포함</th><th style={th}>개당 원가</th><th style={th}>계산 원가</th><th style={th}>메모</th></tr></thead>
            <tbody>{itemRows.map(row => {
              const draft = draftPrefs[row.key] || { includeCost: true, memo: "", deleted: false };
              const pendingDelete = draft.deleted === true && !savedPrefs[row.key]?.deleted;
              return <tr key={row.key} style={{ background: pendingDelete ? "#fff7ed" : "#fff", opacity: pendingDelete ? 0.55 : 1 }}>
                <td style={td}><input aria-label={row.item_name + " 선택"} type="checkbox" checked={selectedItems.includes(row.key)} onChange={() => toggleSelected(row.key)} /></td>
                <td style={td}>{kstDate(row.ordered_at)}</td><td style={td}>{row.buyer_nickname || "(닉네임 없음)"}</td><td style={td}><b>{row.item_name}</b>{pendingDelete && <div style={{ color: "#b45309", fontSize: 11 }}>저장하면 삭제</div>}</td>
                <td style={td}>{money(row.item_price)}원</td>
                <td style={td}><button onClick={() => updateDraft(row.key, { includeCost: !draft.includeCost })} aria-label="판매원가 포함 여부 전환" style={{ ...button, minWidth: 44, padding: "5px 10px", background: draft.includeCost ? "#dcfce7" : "#f3f4f6", borderColor: draft.includeCost ? "#86efac" : "#d1d5db", color: draft.includeCost ? "#166534" : "#6b7280" }}>{draft.includeCost ? "Y" : "N"}</button></td>
                <td style={td}>{row.unitCost == null ? <span style={{ color: "#b91c1c" }}>미매칭</span> : money(row.unitCost) + "원"}</td>
                <td style={td}>{row.includeCost ? row.cost == null ? "원가 미매칭" : money(row.cost) + "원" : <span style={{ color: "#9ca3af" }}>제외</span>}</td>
                <td style={td}><input value={draft.memo} onChange={e => updateDraft(row.key, { memo: e.target.value })} placeholder="메모 입력" style={{ width: 220, maxWidth: "45vw", height: 32, padding: "0 8px", border: "1px solid #d1d5db", borderRadius: 6 }} /></td>
              </tr>;
            })}</tbody>
            <tfoot><tr style={{ background: "#f9fafb", fontWeight: 800 }}><td style={td} colSpan={4}>합계</td><td style={td}>{money(currentSummary.sales)}원</td><td style={td}>—</td><td style={td}>—</td><td style={td}>{money(knownCost)}원</td><td style={td}>—</td></tr></tfoot>
          </table></div>}
        {deletedItems.length > 0 && <div style={{ padding: 14, borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
          <b>삭제된 판매 내역 · {deletedItems.length}건</b>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{deletedItems.map(([key]) => { const row = allRowsById.get(key); return <span key={key} style={chip}>{row ? kstDate(row.ordered_at) + " · " + row.buyer_nickname + " · " + row.item_name : key}<button onClick={() => updateDraft(key, { deleted: false })} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#1d4ed8", marginLeft: 5 }}>삭제 취소</button></span>; })}</div>
          {hasUnsaved && <small style={{ display: "block", marginTop: 8, color: "#92400e" }}>삭제 취소도 저장 버튼을 눌러 적용하세요.</small>}
        </div>}
      </section>

      <section style={panel}>
        <div style={panelTitle}>구매자별 총 구매금액</div>
        {!currentBuyers.length ? <div style={{ padding: 24, color: "#6b7280" }}>이 기간의 구매자가 없습니다.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}>구매자</th><th style={th}>선택 기간 구매금액</th><th style={th}>누적 구매금액</th><th style={th}>누적 주문</th><th style={th}>누적 아이템</th></tr></thead>
            <tbody>{currentBuyers.map(buyer => { const total = allTimeByBuyer.get(buyer.buyer_nickname); return <tr key={buyer.buyer_nickname}><td style={td}><b>{buyer.buyer_nickname}</b></td><td style={td}>{money(buyer.sales)}원</td><td style={td}><b>{money(total?.sales || buyer.sales)}원</b></td><td style={td}>{money(total?.order_count || buyer.order_count)}건</td><td style={td}>{money(total?.item_count || buyer.item_count)}개</td></tr>; })}</tbody>
          </table></div>}
      </section>
    </>}
  </main>;
}
