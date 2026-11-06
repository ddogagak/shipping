"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  calculatePricing,
  DEFAULT_PRICING_SETTINGS,
  loadPricingSettings,
  type PricingSettings,
} from "@/lib/pricing";

type PriceMode = "unit" | "box";
type Currency = "JPY" | "CNY";
const won = (n: number) => `${Math.ceil(n).toLocaleString("ko-KR")}원`;
const readNumber = (text: string) => {
  const n = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const moneyInput: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "13px 14px",
  borderRadius: 12, border: "1px solid #cbd5e1",
  fontSize: 17, background: "#fff", color: "#111827",
};
const panel: CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 22,
};
const textMuted: CSSProperties = { color: "#64748b", fontSize: 13, lineHeight: 1.6 };
function PriceResult({ title, boxPrice, count, cost, retention, featured }: {
  title: string; boxPrice: number; count: number; cost: number;
  retention: number; featured?: boolean;
}) {
  const unit = Math.ceil(boxPrice / count);
  const actualBox = unit * count;
  const netProfit = actualBox * retention - cost;
  const margin = actualBox > 0 ? (netProfit / actualBox) * 100 : 0;
  return (
    <div style={{
      padding: 18, borderRadius: 16,
      border: featured ? "2px solid #2563eb" : "1px solid #e2e8f0",
      background: featured ? "#eff6ff" : "#f8fafc",
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
        {won(unit)} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>개당</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>박스 합계 {won(actualBox)}</div>
      <div style={{ ...textMuted, marginTop: 8 }}>
        예상 순이익 {won(netProfit)} · 실제 수익률 {margin.toFixed(1)}%
      </div>
    </div>
  );
}

export default function SourcingResearchPage() {
  const [mode, setMode] = useState<PriceMode>("unit");
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [price, setPrice] = useState("");
  const [countText, setCountText] = useState("10");
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS);
  useEffect(() => { setSettings(loadPricingSettings()); }, []);

  const calculation = useMemo(() => {
    const amount = readNumber(price);
    const count = readNumber(countText);
    if (!price.trim() || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isSafeInteger(count) || count <= 0) return null;

    const purchase = mode === "unit" ? amount * count : amount;
    if (!Number.isFinite(purchase)) return null;
    const pricing = calculatePricing(currency, purchase, count, settings);
    const retention = settings.salesRetentionRate;
    const breakEven = retention > 0
      ? Math.ceil(pricing.costPrice / retention / count) * count : null;
    const fifteen = retention > 0.15
      ? Math.ceil(pricing.costPrice / (retention - 0.15) / count) * count : null;
    const twenty = retention > 0.2
      ? Math.ceil(pricing.costPrice / (retention - 0.2) / count) * count : null;
    return { purchase, count, pricing, retention, breakEven, fifteen, twenty };
  }, [price, countText, mode, currency, settings]);

  const rate = currency === "JPY" ? settings.jpyRate : settings.cnyRate;
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 16px 60px", color: "#111827" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 29, margin: 0, fontWeight: 900 }}>caculator</h1>
          <p style={{ ...textMuted, margin: "7px 0 0" }}>단가 또는 박스 가격으로 0% 손익분기점·최소마진·15%·20% 판매가를 바로 비교해요.</p>
        </div>
        <Link href="/" style={{ textDecoration: "none", padding: "9px 13px", border: "1px solid #cbd5e1", borderRadius: 10, color: "#334155", whiteSpace: "nowrap" }}>메인으로</Link>
      </div>

      <section style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>가격 입력 방식</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 23, flexWrap: "wrap" }}>
          {([{ id: "unit", label: "개당 매입 단가" }, { id: "box", label: "박스 총 매입가" }] as const).map(({ id, label }) => (
            <button type="button" key={id} onClick={() => {
              const oldAmount = readNumber(price);
              const count = readNumber(countText);
              if (mode !== id && Number.isFinite(oldAmount) && Number.isSafeInteger(count) && count > 0)
                setPrice(String(id === "box" ? Math.round(oldAmount * count * 100) / 100 : Math.round(oldAmount / count * 100) / 100));
              setMode(id);
            }} style={{
              border: mode === id ? "1px solid #2563eb" : "1px solid #d1d5db",
              background: mode === id ? "#eff6ff" : "#fff", color: mode === id ? "#1d4ed8" : "#374151",
              fontWeight: 800, borderRadius: 10, padding: "11px 15px", cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16 }}>
          <label style={{ display: "grid", gap: 8, fontWeight: 800, fontSize: 14 }}>
            통화
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} style={moneyInput}>
              <option value="JPY">JPY (엔)</option>
              <option value="CNY">CNY (위안)</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 8, fontWeight: 800, fontSize: 14 }}>
            {mode === "unit" ? "개당 매입 단가" : "박스 총 매입가"} ({currency})
            <input type="text" inputMode="decimal" placeholder={mode === "unit" ? "예: 594" : "예: 5940"}
              value={price} onChange={(e) => setPrice(e.target.value)} style={moneyInput}/>
          </label>
          <label style={{ display: "grid", gap: 8, fontWeight: 800, fontSize: 14 }}>
            박스당 구성품 수 (개)
            <input type="text" inputMode="numeric" placeholder="예: 10" value={countText}
              onChange={(e) => setCountText(e.target.value)} style={moneyInput}/>
          </label>
        </div>
        <div style={{ ...textMuted, marginTop: 16 }}>
          또가 설정: 1{currency} = {rate.toLocaleString("ko-KR")}원 · 수입원가 × {settings.importCostMultiplier} + {won(settings.fixedCost)} · 판매대금 {Math.round(settings.salesRetentionRate * 100)}% 반영
        </div>
      </section>

      {calculation ? (
        <>
          <section style={{ ...panel, marginTop: 16 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 15px" }}>예상 판매가</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {calculation.breakEven !== null &&
                <PriceResult title="0% 마진 (손익분기점)" boxPrice={calculation.breakEven}
                  count={calculation.count} cost={calculation.pricing.costPrice} retention={calculation.retention}/>}
              <PriceResult title="또가 기본 최소마진" featured
                boxPrice={calculation.pricing.minimumMarginPrice}
                count={calculation.count} cost={calculation.pricing.costPrice} retention={calculation.retention}/>
              {calculation.fifteen !== null &&
                <PriceResult title="순수익률 15%" boxPrice={calculation.fifteen}
                  count={calculation.count} cost={calculation.pricing.costPrice} retention={calculation.retention}/>}
              {calculation.twenty !== null &&
                <PriceResult title="순수익률 20%" boxPrice={calculation.twenty}
                  count={calculation.count} cost={calculation.pricing.costPrice} retention={calculation.retention}/>}
            </div>
            <p style={{ ...textMuted, marginBottom: 0 }}>
              0% 마진은 판매수수료·부가세 차감 후 원가만 회수하는 최소 판매가입니다.
              개당 판매가를 원 단위 올림하므로 소액의 이익이 남을 수 있습니다.
              수익률 = (판매총액 × {calculation.retention} − 추정 원가) ÷ 판매총액.
            </p>
          </section>
          <section style={{ ...panel, marginTop: 16 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>계산 내역</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <div><div style={textMuted}>박스 매입가</div><strong>{calculation.purchase.toLocaleString("ko-KR")} {currency}</strong></div>
              <div><div style={textMuted}>추정 박스 원가</div><strong>{won(calculation.pricing.costPrice)}</strong></div>
              <div><div style={textMuted}>추정 개당 원가</div><strong>{won(calculation.pricing.costPrice / calculation.count)}</strong></div>
              <div><div style={textMuted}>기본 목표이익</div><strong>{won(calculation.pricing.targetProfit)}</strong></div>
            </div>
          </section>
        </>
      ) : (
        <section style={{ ...panel, marginTop: 16, textAlign: "center", color: "#64748b" }}>
          매입 가격과 1 이상의 박스 구성품 수를 입력하면 결과가 표시돼요.
        </section>
      )}
      <p style={{ ...textMuted, marginTop: 14 }}>
        기존 소싱 검토 기록은 삭제하지 않았으며, 이 페이지는 저장 없는 계산기 화면으로 변경했습니다.
        설정값은 또가 가격 설정을 불러오며 별도 변경하지 않아요.
      </p>
    </main>
  );
}
