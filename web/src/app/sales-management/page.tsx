"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

type SoldItem = { item_name: string; quantity: number; sales: number };
type Buyer = { buyer_nickname: string; sales: number; order_count: number; item_count: number };
type Period = { key: string; sales: number; order_count: number; item_count: number; items: SoldItem[]; buyers: Buyer[] };
type Report = { monthly: Period[]; quarterly: Period[]; all_time_buyers: Buyer[]; excluded_item_count: number; included_order_count: number; included_item_count: number; imported_order_count: number; last_imported_at: string | null; default_excluded_keywords: string[]; custom_keywords: string[] };
type StockItem = { display_name?: string; product_name?: string; option_text?: string; purchase_quantity?: number; component_count?: number; unit_cost_price?: number };
type CostMatch = { unitCost: number; cost: number | null };
const STORAGE_KEY = "ddoga_sales_excluded_keywords";
const money = (value: number) => Math.round(Number(value || 0)).toLocaleString("ko-KR");
const pageStyle: CSSProperties = { maxWidth: 1320, margin: "0 auto", padding: 24, color: "#111827" };
const button: CSSProperties = { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", textDecoration: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const card: CSSProperties = { padding: 18, border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", minHeight: 110 };
const label: CSSProperties = { color: "#6b7280", fontSize: 13, fontWeight: 700 };
const value: CSSProperties = { display: "block", marginTop: 10, fontSize: 26, fontWeight: 850, letterSpacing: "-.04em" };
const th: CSSProperties = { padding: "11px 14px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", whiteSpace: "nowrap", textAlign: "left" };
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\\s\\p{P}\\p{S}]/gu, "");
function periodLabel(key: string) {
  if (key.includes("-Q")) return key.replace("-Q", "년 ").concat("분기");
  return key.replace("-", "년 ") + "월";
}
function kstDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
      const key = normalize(candidate);
      if (!key) continue;
      const group = groups.get(key) || { cost: 0, weight: 0 };
      group.cost += unitCost * weight;
      group.weight += weight;
      groups.set(key, group);
    }
  }
  return new Map(Array.from(groups, ([key, group]) => [key, group.cost / group.weight]));
}

export default function SalesManagementPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [ready, setReady] = useState(false);
  const [granularity, setGranularity] = useState<"month" | "quarter">("month");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (terms: string[]) => {
    setLoading(true);
    setError("");
    try {
      const [salesResponse, stockResponse] = await Promise.all([
        fetch("/api/sales-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custom_keywords: terms }), cache: "no-store" }),
        fetch("/api/sale-inventory", { cache: "no-store" }),
      ]);
      const [salesData, stockData] = await Promise.all([salesResponse.json(), stockResponse.json()]);
      if (!salesResponse.ok || !salesData.ok) throw new Error(salesData.message || "매출 자료를 불러오지 못했습니다.");
      if (!stockResponse.ok || !stockData.ok) throw new Error(stockData.message || "방송판매재고 원가를 불러오지 못했습니다.");
      setReport(salesData);
      setInventory(Array.isArray(stockData.items) ? stockData.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let terms: string[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) terms = parsed.map(x => String(x || "").trim()).filter(Boolean);
    } catch {}
    setKeywords(terms);
    setReady(true);
    void refresh(terms);
  }, [refresh]);

  const periods = useMemo(() => granularity === "month" ? report?.monthly || [] : report?.quarterly || [], [granularity, report]);
  const selectedKey = periods.some(p => p.key === selected) ? selected : periods[0]?.key || "";
  const current = periods.find(p => p.key === selectedKey);
  const costIndex = useMemo(() => buildCostIndex(inventory), [inventory]);
  const itemRows = useMemo(() => (current?.items || []).map(item => {
    const unitCost = costIndex.get(normalize(item.item_name));
    return { ...item, unitCost: unitCost ?? null, cost: unitCost == null ? null : unitCost * item.quantity };
  }), [current, costIndex]);
  const knownCost = itemRows.reduce((sum, item) => sum + (item.cost ?? 0), 0);
  const unmatchedQuantity = itemRows.reduce((sum, item) => sum + (item.unitCost == null ? item.quantity : 0), 0);
  const grossAfterCogs = Number(current?.sales || 0) - knownCost;
  const allTimeByBuyer = useMemo(() => new Map((report?.all_time_buyers || []).map(b => [b.buyer_nickname, b])), [report]);

  const saveKeywords = (next: string[]) => {
    const unique = Array.from(new Set(next.map(x => x.normalize("NFKC").trim()).filter(Boolean))).slice(0, 100);
    setKeywords(unique);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    void refresh(unique);
  };
  const addKeyword = (event: FormEvent) => {
    event.preventDefault();
    const term = keywordInput.normalize("NFKC").trim();
    if (!term || keywords.some(x => x.toLowerCase() === term.toLowerCase())) return;
    setKeywordInput("");
    saveKeywords([...keywords, term]);
  };

  return <main style={pageStyle}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0, fontSize: 30 }}>매출관리</h1><p style={{ color: "#6b7280", margin: "6px 0 0" }}>와이스 판매와 방송판매재고 원가를 월별·분기별로 확인합니다.</p></div>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" style={button}>메인</Link><Link href="/purchases" style={button}>매입관리</Link><Link href="/sale-inventory" style={button}>방송판매재고</Link><Link href="/domestic-upload" style={button}>와이스 주문 동기화</Link>
      </nav>
    </header>

    <section style={{ padding: 16, marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <div style={{ fontWeight: 800, marginBottom: 5 }}>매출에서 제외할 와이스 아이템 키워드</div>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 12 }}>기본 제외: 야생 · 용자 · 소장 · 양도 · 양고 · 배송비 키워드. 추가한 키워드는 이 브라우저에 저장됩니다.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(report?.default_excluded_keywords || ["야생", "용자", "소장", "양도", "양고", "배송비", "배송료", "택배비", "送料", "shipping fee", "shipping cost", "delivery fee", "postage"]).map(term => <span key={term} style={chip}>{term}</span>)}
        {keywords.map(term => <span key={term} style={{ ...chip, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>{term}<button aria-label={term + " 키워드 삭제"} onClick={() => saveKeywords(keywords.filter(x => x !== term))} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900, marginLeft: 5 }}>×</button></span>)}
      </div>
      <form onSubmit={addKeyword} style={{ display: "flex", gap: 8, maxWidth: 520 }}>
        <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="제외할 키워드 추가" style={{ flex: 1, minWidth: 0, height: 36, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8 }} />
        <button type="submit" style={button}>키워드 추가</button>
      </form>
    </section>

    <section style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => setGranularity("month")} style={{ ...button, background: granularity === "month" ? "#111827" : "#fff", color: granularity === "month" ? "#fff" : "#111827" }}>월별</button>
      <button onClick={() => setGranularity("quarter")} style={{ ...button, background: granularity === "quarter" ? "#111827" : "#fff", color: granularity === "quarter" ? "#fff" : "#111827" }}>분기별</button>
      <select aria-label="기간 선택" value={selectedKey} onChange={e => setSelected(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 700 }}>
        {periods.map(p => <option value={p.key} key={p.key}>{periodLabel(p.key)}</option>)}
      </select>
      <span style={{ color: "#6b7280", fontSize: 12 }}>수량·매출은 키워드 제외 후 집계합니다.</span>
    </section>

    {error && <div role="alert" style={{ padding: 14, marginBottom: 16, borderRadius: 10, background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }}>{error}</div>}
    {loading && <p style={{ color: "#6b7280" }}>불러오는 중...</p>}

    {!loading && !error && report && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <article style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}><span style={label}>매출 · {selectedKey ? periodLabel(selectedKey) : "선택 기간"}</span><strong style={{ ...value, color: "#1d4ed8" }}>{money(Number(current?.sales || 0))}원</strong><small style={{ color: "#6b7280" }}>와이스 아이템 금액 · 주문 {money(Number(current?.order_count || 0))}건</small></article>
        <article style={card}><span style={label}>방송판매재고 기준 사입원가</span><strong style={{ ...value }}>{money(knownCost)}원</strong><small style={{ color: "#6b7280" }}>개당 원가 × 판매수량 · 미매칭 {money(unmatchedQuantity)}개</small></article>
        <article style={{ ...card, background: "#f0fdf4", borderColor: "#bbf7d0" }}><span style={label}>매출 − 확인된 상품원가</span><strong style={{ ...value, color: grossAfterCogs >= 0 ? "#15803d" : "#b91c1c" }}>{money(grossAfterCogs)}원</strong><small style={{ color: "#6b7280" }}>플랫폼 수수료·세금·미매칭 원가 제외 전 단순 차액</small></article>
        <article style={{ ...card, background: "#f9fafb" }}><span style={label}>와이스 통장 입금</span><strong style={{ ...value, fontSize: 20, color: "#6b7280" }}>데이터 연동 대기</strong><small style={{ color: "#6b7280" }}>입금 내역 링크를 받으면 연결합니다.</small></article>
      </section>

      <section style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 14px", margin: "14px 0 20px", background: "#f9fafb", borderRadius: 10, color: "#4b5563", fontSize: 12 }}>
        <span>가져온 와이스 주문 {money(Number(report.imported_order_count || 0))}건</span><span>집계 주문 {money(Number(report.included_order_count || 0))}건</span><span>제외 아이템 {money(Number(report.excluded_item_count || 0))}개</span><span>마지막 동기화 {kstDate(report.last_imported_at)}</span>
        <span style={{ marginLeft: "auto" }}>원가가 연결되지 않은 아이템 {money(unmatchedQuantity)}개</span>
      </section>

      <section style={panel}>
        <div style={panelTitle}>{granularity === "month" ? "월별" : "분기별"} 실적</div>
        {periods.length === 0 ? <div style={{ padding: 24, color: "#6b7280" }}>표시할 자료가 없습니다. 와이스 주문을 동기화해 주세요.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}>기간</th><th style={th}>매출</th><th style={th}>주문</th><th style={th}>판매수량</th><th style={th}>선택</th></tr></thead>
            <tbody>{periods.map(p => <tr key={p.key} onClick={() => setSelected(p.key)} style={{ cursor: "pointer", background: p.key === selectedKey ? "#eff6ff" : "#fff" }}>
              <td style={td}><b>{periodLabel(p.key)}</b></td><td style={td}>{money(p.sales)}원</td><td style={td}>{money(p.order_count)}건</td><td style={td}>{money(p.item_count)}개</td><td style={td}>{p.key === selectedKey ? "●" : ""}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      <section style={panel}>
        <div style={panelTitle}>{selectedKey ? periodLabel(selectedKey) : "선택 기간"}에 판매된 아이템</div>
        {!itemRows.length ? <div style={{ padding: 24, color: "#6b7280" }}>이 기간의 판매 아이템이 없습니다.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}>아이템</th><th style={th}>판매수량</th><th style={th}>매출</th><th style={th}>개당 원가</th><th style={th}>계산된 원가</th></tr></thead>
            <tbody>{itemRows.map(item => <tr key={item.item_name}><td style={td}><b>{item.item_name}</b></td><td style={td}>{money(item.quantity)}개</td><td style={td}>{money(item.sales)}원</td><td style={td}>{item.unitCost == null ? <span style={{ color: "#b91c1c" }}>미매칭</span> : money(item.unitCost) + "원"}</td><td style={td}>{item.cost == null ? "—" : money(item.cost) + "원"}</td></tr>)}</tbody>
            <tfoot><tr style={{ background: "#f9fafb", fontWeight: 800 }}><td style={td}>합계</td><td style={td}>{money(Number(current?.item_count || 0))}개</td><td style={td}>{money(Number(current?.sales || 0))}원</td><td style={td}>—</td><td style={td}>{money(knownCost)}원</td></tr></tfoot>
          </table></div>}
      </section>

      <section style={panel}>
        <div style={panelTitle}>구매자별 총 구매금액</div>
        {!current?.buyers?.length ? <div style={{ padding: 24, color: "#6b7280" }}>이 기간의 구매자가 없습니다.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb" }}><th style={th}>구매자</th><th style={th}>선택 기간 구매금액</th><th style={th}>누적 구매금액</th><th style={th}>누적 주문</th><th style={th}>누적 아이템</th></tr></thead>
            <tbody>{current.buyers.map(buyer => { const total = allTimeByBuyer.get(buyer.buyer_nickname); return <tr key={buyer.buyer_nickname}><td style={td}><b>{buyer.buyer_nickname}</b></td><td style={td}>{money(buyer.sales)}원</td><td style={td}><b>{money(total?.sales || buyer.sales)}원</b></td><td style={td}>{money(total?.order_count || buyer.order_count)}건</td><td style={td}>{money(total?.item_count || buyer.item_count)}개</td></tr>; })}</tbody>
          </table></div>}
      </section>
    </>}
  </main>;
}

const chip: CSSProperties = { padding: "5px 9px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#f9fafb", color: "#4b5563", fontSize: 12, display: "inline-flex", alignItems: "center" };
const panel: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff", marginBottom: 16 };
const panelTitle: CSSProperties = { padding: "14px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 800 };
