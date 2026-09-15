"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_PRICING_SETTINGS,
  loadPricingSettings,
  savePricingSettings,
  type PricingSettings,
} from "@/lib/pricing";

export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSettings(loadPricingSettings());
  }, []);

  const update = (key: keyof PricingSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: Number(value) }));
    setMessage("");
  };

  const save = () => {
    savePricingSettings(settings);
    setMessage("가격 설정 저장 완료");
  };

  const reset = () => {
    setSettings(DEFAULT_PRICING_SETTINGS);
    savePricingSettings(DEFAULT_PRICING_SETTINGS);
    setMessage("기본값으로 초기화 완료");
  };

  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>가격 계산 설정</h1>
          <p style={{ marginTop: 0, color: "#6b7280" }}>
            환율과 원가·마진 계산 변수를 여기서 수정합니다.
          </p>
        </div>
        <Link href="/domestic-inventory-input">재고 입력으로</Link>
      </div>

      <section style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <NumberField label="JPY 환율계수" value={settings.jpyRate} onChange={(v) => update("jpyRate", v)} />
        <NumberField label="CNY 환율계수" value={settings.cnyRate} onChange={(v) => update("cnyRate", v)} />
        <NumberField label="수입 원가 배수" value={settings.importCostMultiplier} step="0.01" onChange={(v) => update("importCostMultiplier", v)} />
        <NumberField label="박스당 고정비 (원)" value={settings.fixedCost} onChange={(v) => update("fixedCost", v)} />
        <NumberField label="최소 목표이익 (원)" value={settings.minimumProfit} onChange={(v) => update("minimumProfit", v)} />
        <NumberField label="원가 대비 목표이익률" value={settings.targetProfitRate} step="0.01" onChange={(v) => update("targetProfitRate", v)} />
        <NumberField label="판매대금 잔존율" value={settings.salesRetentionRate} step="0.01" onChange={(v) => update("salesRetentionRate", v)} />
      </section>

      <div style={{ marginTop: 20, padding: 14, background: "#f8fafc", borderRadius: 10 }}>
        <strong>현재 공식</strong>
        <div style={{ marginTop: 8 }}>원가 = 구매가 × 환율 × {settings.importCostMultiplier} + {settings.fixedCost.toLocaleString()}원</div>
        <div>목표이익 = MAX({settings.minimumProfit.toLocaleString()}원, 원가 × {(settings.targetProfitRate * 100).toFixed(1)}%)</div>
        <div>최소마진가격 = (원가 + 목표이익) ÷ {settings.salesRetentionRate}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={save} style={buttonStyle}>저장</button>
        <button onClick={reset} style={secondaryButtonStyle}>기본값 복원</button>
      </div>

      {message ? <div style={{ marginTop: 12, fontWeight: 700 }}>{message}</div> : null}
    </main>
  );
}

function NumberField({
  label, value, onChange, step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, alignItems: "center" }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 38, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
      />
    </label>
  );
}

const buttonStyle: React.CSSProperties = {
  border: 0, borderRadius: 8, padding: "10px 16px", background: "#111827",
  color: "#fff", fontWeight: 800, cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle, background: "#e5e7eb", color: "#111827",
};
