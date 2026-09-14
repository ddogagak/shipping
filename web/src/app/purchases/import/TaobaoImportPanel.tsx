"use client";

import { useState } from "react";

export default function TaobaoImportPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const pushMessage = (message: string) => {
    setMsg(message);
    onMessage?.(message);
  };

  const selectedCount = orders.filter((o) => o._selected).length;
  const newCount = orders.filter((o) => !o.is_existing).length;
  const existingCount = orders.filter((o) => o.is_existing).length;

  const preview = async () => {
    if (!file) return pushMessage("订单数据.xlsx 파일을 선택해줘.");
    setBusy(true);
    pushMessage("분석 중...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "preview");
      const res = await fetch("/api/purchases/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "실패");
      const next = (j.orders || []).map((o: any) => ({ ...o, _selected: !o.is_existing }));
      setOrders(next);
      pushMessage(`신규 ${j.newCount || 0}개 · 기존 등록 ${j.existingCount || 0}개${j.skippedClosed ? ` · 거래종료 제외 ${j.skippedClosed}개` : ""}`);
    } catch (e) {
      pushMessage(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file) return pushMessage("订单数据.xlsx 파일을 선택해줘.");
    const selected = orders.filter((o) => o._selected).map((o) => String(o.order_number));
    if (!selected.length) return pushMessage("저장할 주문을 하나 이상 체크해줘.");
    setBusy(true);
    pushMessage("저장 중...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "save");
      fd.append("selected_order_numbers", JSON.stringify(selected));
      const res = await fetch("/api/purchases/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "실패");
      pushMessage(`저장 완료 · 신규 ${j.created || 0}개 · 기존 운송장 갱신 ${j.updated || 0}개 · 체크 제외 ${j.skippedUnchecked || 0}개`);
    } catch (e) {
      pushMessage(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  };

  const toggleAll = (checked: boolean) => setOrders((prev) => prev.map((o) => ({ ...o, _selected: checked })));
  const toggleNewOnly = () => setOrders((prev) => prev.map((o) => ({ ...o, _selected: !o.is_existing })));
  const toggleOne = (orderNumber: string, checked: boolean) =>
    setOrders((prev) => prev.map((o) => String(o.order_number) === orderNumber ? { ...o, _selected: checked } : o));

  return <>
    <section style={box}>
      <h2 style={h2}>🇨🇳 Taobao 엑셀 등록</h2>
      <p style={sub}>중복 주문을 확인하고 저장할 주문만 체크해서 등록합니다.</p>
      <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setOrders([]); setMsg(""); }} />
      <div style={actions}><button style={button} disabled={busy} onClick={preview}>미리보기</button><button style={primary} disabled={busy || !orders.length} onClick={save}>체크한 주문 등록</button></div>
    </section>

    {msg && <div style={notice}>{msg}</div>}

    {!!orders.length && <>
      <section style={toolbar}>
        <div><b>선택 {selectedCount}/{orders.length}</b> · 신규 {newCount} · 기존 {existingCount}</div>
        <div style={actionsInline}>
          <button style={smallButton} onClick={() => toggleAll(true)}>전체 선택</button>
          <button style={smallButton} onClick={toggleNewOnly}>신규만 선택</button>
          <button style={smallButton} onClick={() => toggleAll(false)}>전체 해제</button>
        </div>
      </section>
      <p style={guide}>기존 등록 주문은 기본 체크 해제돼. 체크하더라도 기존 상품·상태는 유지되고 운송사/운송장 정보만 갱신돼.</p>
      {orders.map((o) => <section key={`${o.source_site}-${o.order_number}`} style={{ ...card, ...(o._selected ? {} : unselectedCard) }}>
        <div style={orderHead}>
          <label style={checkLabel}><input type="checkbox" checked={!!o._selected} onChange={(e) => toggleOne(String(o.order_number), e.target.checked)} /><b>저장</b></label>
          <div style={orderTitle}><b>{o.order_number}</b> · {o.shop_name} · {o.ordered_at}</div>
          <span style={o.is_existing ? existingBadge : newBadge}>{o.is_existing ? "기존 등록" : "신규"}</span>
        </div>
        {(o.items || []).map((i: any, n: number) => <div key={n} style={itemRow}><span>{i.product_name}</span><b>{Number(i.unit_price).toLocaleString()} CNY × {i.quantity}</b></div>)}
      </section>)}
    </>}
  </>;
}

const box = { border: "1px solid #d1d5db", borderRadius: 14, padding: 20, background: "#fff" };
const h2 = { margin: "0 0 14px", fontSize: 20 };
const sub = { margin: "-4px 0 14px", color: "#6b7280", fontSize: 14 };
const actions = { display: "flex", gap: 8, marginTop: 14 };
const actionsInline = { display: "flex", gap: 6, flexWrap: "wrap" as const };
const button = { padding: "10px 16px", borderRadius: 10, border: "1px solid #111827", background: "white", fontWeight: 800, cursor: "pointer" };
const primary = { ...button, background: "#111827", color: "white" };
const smallButton = { padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", fontWeight: 800, cursor: "pointer", fontSize: 12 };
const notice = { marginTop: 14, padding: 13, borderRadius: 10, background: "#eef2ff", fontWeight: 700 };
const toolbar = { marginTop: 18, padding: 12, border: "1px solid #d1d5db", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" as const, background: "#f8fafc" };
const guide = { margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "#f0fdf4", color: "#166534", fontSize: 13 };
const card = { border: "1px solid #ddd", borderRadius: 14, padding: 16, marginTop: 12, background: "white" };
const unselectedCard = { opacity: 0.58, background: "#f8fafc" };
const orderHead = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const };
const checkLabel = { display: "flex", alignItems: "center", gap: 5, fontSize: 13 };
const orderTitle = { flex: 1, minWidth: 240 };
const badge = { display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900 };
const existingBadge = { ...badge, background: "#fee2e2", color: "#991b1b" };
const newBadge = { ...badge, background: "#dcfce7", color: "#166534" };
const itemRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #ddd", marginTop: 8 };
