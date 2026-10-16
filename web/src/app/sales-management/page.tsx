"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Period = { key: string; sales: number; order_count: number; purchases: Record<string, number> };
type Report = { monthly: Period[]; quarterly: Period[]; excluded_order_count: number; sales_order_count: number; last_imported_at: string | null };
const money = (value: number) => Math.round(Number(value || 0)).toLocaleString("ko-KR");
const currencyName: Record<string, string> = { KRW: "원", JPY: "엔", CNY: "위안", USD: "달러", UNKNOWN: "통화 미상" };
const pageStyle: CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: 24, color: "#111827" };
const button: CSSProperties = { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", textDecoration: "none", fontSize: 13, fontWeight: 700 };
const card: CSSProperties = { padding: 18, border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", minHeight: 112 };
const label: CSSProperties = { color: "#6b7280", fontSize: 13, fontWeight: 700 };
const value: CSSProperties = { display: "block", marginTop: 10, fontSize: 26, fontWeight: 850, letterSpacing: "-.04em" };

function periodLabel(key: string) {
  if (key.includes("-Q")) return key.replace("-Q", "년 ").concat("분기");
  return key.replace("-", "년 ") + "월";
}
function purchaseLines(period?: Period) {
  const entries = Object.entries(period?.purchases || {}).filter(([, amount]) => Number(amount) !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <span style={{ color: "#9ca3af" }}>기록 없음</span>;
  return <div style={{ display: "grid", gap: 4 }}>{entries.map(([currency, amount]) => <span key={currency}><b>{money(amount)}</b> {currencyName[currency] || currency}</span>)}</div>;
}
function kstDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function SalesManagementPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [granularity, setGranularity] = useState<"month" | "quarter">("month");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/sales-management", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || "매출 자료를 불러오지 못했습니다.");
        if (active) setReport(data);
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "자료를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const periods = useMemo(() => granularity === "month" ? report?.monthly || [] : report?.quarterly || [], [granularity, report]);
  const selectedKey = periods.some(p => p.key === selected) ? selected : periods[0]?.key || "";
  const current = periods.find(p => p.key === selectedKey);
  const krwPurchases = Number(current?.purchases?.KRW || 0);
  const salesMinusKrwPurchase = Number(current?.sales || 0) - krwPurchases;

  return <main style={pageStyle}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div><h1 style={{ margin: 0, fontSize: 30 }}>매출관리</h1><p style={{ color: "#6b7280", margin: "6px 0 0" }}>와이스 주문 매출과 매입관리 사입을 월별·분기별로 확인합니다.</p></div>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" style={button}>메인</Link><Link href="/purchases" style={button}>매입관리</Link><Link href="/sale-inventory" style={button}>방송판매재고</Link><Link href="/domestic-upload" style={button}>와이스 주문 동기화</Link>
      </nav>
    </header>

    <section style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => setGranularity("month")} style={{ ...button, background: granularity === "month" ? "#111827" : "#fff", color: granularity === "month" ? "#fff" : "#111827" }}>월별</button>
      <button onClick={() => setGranularity("quarter")} style={{ ...button, background: granularity === "quarter" ? "#111827" : "#fff", color: granularity === "quarter" ? "#fff" : "#111827" }}>분기별</button>
      <select aria-label="기간 선택" value={selectedKey} onChange={e => setSelected(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 700 }}>
        {periods.map(p => <option value={p.key} key={p.key}>{periodLabel(p.key)}</option>)}
      </select>
      <span style={{ color: "#6b7280", fontSize: 12 }}>매출 키워드 제외: 야생 · 용자 · 소장 · 양도 · 양고</span>
    </section>

    {error && <div role="alert" style={{ padding: 14, marginBottom: 16, borderRadius: 10, background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }}>{error}</div>}
    {loading && <p style={{ color: "#6b7280" }}>불러오는 중...</p>}

    {!loading && !error && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <article style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}><span style={label}>매출 · {selectedKey ? periodLabel(selectedKey) : "선택 기간"}</span><strong style={{ ...value, color: "#1d4ed8" }}>{money(Number(current?.sales || 0))}원</strong><small style={{ color: "#6b7280" }}>와이스 상품금액 · 주문 {money(Number(current?.order_count || 0))}건</small></article>
        <article style={card}><span style={label}>사입 · 통화별</span><div style={{ ...value, fontSize: 18, marginTop: 12 }}>{purchaseLines(current)}</div><small style={{ color: "#6b7280" }}>매입관리 실결제 + 국내배송비 · 취소 제외</small></article>
        <article style={{ ...card, background: "#f0fdf4", borderColor: "#bbf7d0" }}><span style={label}>매출 − 원화 사입</span><strong style={{ ...value, color: salesMinusKrwPurchase >= 0 ? "#15803d" : "#b91c1c" }}>{money(salesMinusKrwPurchase)}원</strong><small style={{ color: "#6b7280" }}>참고 차액 · 외화 사입과 수수료는 미반영</small></article>
        <article style={{ ...card, background: "#f9fafb" }}><span style={label}>와이스 통장 입금</span><strong style={{ ...value, fontSize: 20, color: "#6b7280" }}>데이터 연동 대기</strong><small style={{ color: "#6b7280" }}>입금 내역 링크를 받으면 연결합니다.</small></article>
      </section>

      <section style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 14px", margin: "14px 0 20px", background: "#f9fafb", borderRadius: 10, color: "#4b5563", fontSize: 12 }}>
        <span>가져온 와이스 주문 {money(Number(report?.sales_order_count || 0))}건</span><span>키워드 제외 {money(Number(report?.excluded_order_count || 0))}건</span><span>마지막 동기화 {kstDate(report?.last_imported_at)}</span>
        <span style={{ marginLeft: "auto" }}>매출−사입 차액은 순이익이 아닌 단순 참고값입니다.</span>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 800 }}>{granularity === "month" ? "월별" : "분기별"} 실적</div>
        {periods.length === 0 ? <div style={{ padding: 24, color: "#6b7280" }}>표시할 자료가 없습니다. DB 업데이트 후 와이스 주문 JSON을 다시 동기화해 주세요.</div> :
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb", textAlign: "left" }}><th style={th}>기간</th><th style={th}>매출</th><th style={th}>주문</th><th style={th}>사입 · 통화별</th><th style={th}>매출−원화 사입</th></tr></thead>
            <tbody>{periods.map(p => <tr key={p.key} onClick={() => setSelected(p.key)} style={{ cursor: "pointer", background: p.key === selectedKey ? "#eff6ff" : "#fff" }}>
              <td style={td}><b>{periodLabel(p.key)}</b></td><td style={td}>{money(p.sales)}원</td><td style={td}>{money(p.order_count)}건</td><td style={td}>{purchaseLines(p)}</td><td style={td}>{money(p.sales - Number(p.purchases?.KRW || 0))}원</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </>}
  </main>;
}

const th: CSSProperties = { padding: "11px 14px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
