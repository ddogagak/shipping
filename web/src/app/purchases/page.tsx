"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

const statuses = ["전체", "주문완료", "현지배송", "배대지", "국제배송", "통관", "입고완료", "취소"];

function money(value: unknown) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export default function PurchasesPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("전체");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/purchases", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "조회 실패");
      setOrders(json.orders || []);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return orders.filter((order) => {
      if (status !== "전체" && order.order_status !== status) return false;
      if (!keyword) return true;

      const text = [
        order.order_number,
        order.shop_name,
        order.tracking_number,
        ...(order.purchase_items || []).flatMap((item: any) => [
          item.display_name_ko,
          item.matched_name_ko,
          item.product_name,
          item.option_text,
        ]),
      ].filter(Boolean).join(" ").toLowerCase();

      return text.includes(keyword);
    });
  }, [orders, q, status]);

  async function updateOrder(order: any, nextStatus: string) {
    setMsg("");
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, order_status: nextStatus, memo: order.memo }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(json.message || "상태 저장 실패");
    setOrders((prev) => prev.map((row) => row.id === order.id ? { ...row, order_status: nextStatus } : row));
  }

  function editItem(orderId: string, itemId: string, value: string) {
    setOrders((prev) => prev.map((order) => order.id !== orderId ? order : {
      ...order,
      purchase_items: (order.purchase_items || []).map((item: any) => item.id === itemId ? { ...item, display_name_ko: value } : item),
    }));
  }

  async function saveItem(item: any) {
    setSavingItemId(item.id);
    setMsg("");
    try {
      const res = await fetch("/api/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          display_name_ko: item.display_name_ko,
          sourcing_inventory_id: item.sourcing_inventory_id,
          source_product_id: item.source_product_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "상품 저장 실패");
      setMsg("상품 저장 완료");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "상품 저장 실패");
    } finally {
      setSavingItemId(null);
    }
  }

  async function exportForwarder() {
    setMsg("");
    const res = await fetch("/api/purchases/export-forwarder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: filtered.map((order: any) => order.id) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return setMsg(json.message || "엑셀 생성 실패");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase_forwarder_upload.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(orderId: string, file: File) {
    const fd = new FormData();
    fd.append("order_id", orderId);
    fd.append("file", file);
    fd.append("document_type", "증빙");
    const res = await fetch("/api/purchases/files", { method: "POST", body: fd });
    setMsg(res.ok ? "첨부파일 저장 완료" : "첨부 실패");
    if (res.ok) void load();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>매입관리</h1>
          <p style={subtitleStyle}>실제 구매 주문 · 배송 · 증빙 · 입고 상태 관리</p>
        </div>
        <div style={buttonGroupStyle}>
          <Link href="/" style={secondaryButtonStyle}>메인</Link>
          <Link href="/purchases/cards" style={secondaryButtonStyle}>입고완료 카드</Link>
          <Link href="/purchases/import" style={primaryButtonStyle}>엑셀 매입등록</Link>
          <button type="button" style={secondaryButtonStyle} onClick={exportForwarder}>배대지 엑셀</button>
        </div>
      </div>

      <section style={filterBarStyle}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="주문번호 / 판매처 / 한국어·중국어 상품명 검색" style={searchStyle} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <div style={countStyle}>{filtered.length.toLocaleString()}건 · 상품 {selectedCount}개 선택</div>
      </section>

      {msg ? <div style={messageStyle}>{msg}</div> : null}

      {loading ? <div style={emptyStyle}>불러오는 중...</div> : filtered.length === 0 ? <div style={emptyStyle}>조건에 맞는 매입 주문이 없습니다.</div> : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((order) => {
            const items = order.purchase_items || [];
            const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
            return (
              <section key={order.id} style={orderBoxStyle}>
                <div style={orderHeaderStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={orderHeaderTopStyle}>
                      <b>{order.ordered_at ? String(order.ordered_at).slice(0, 10) : "날짜 없음"}</b>
                      <span style={orderNoStyle}>{order.order_number || "-"}</span>
                      <span style={shopStyle}>{order.shop_name || order.source_site || "-"}</span>
                    </div>
                    <div style={orderMetaStyle}>
                      상품 {items.length}종 / {totalQty}개 · 실결제 <b>{money(order.paid_amount)}위안</b> · 현지배송 {money(order.local_shipping)}위안
                      {order.tracking_number ? ` · 운송장 ${order.tracking_number}` : ""}
                    </div>
                  </div>
                  <div style={orderActionsStyle}>
                    <select value={order.order_status || "주문완료"} onChange={(e) => void updateOrder(order, e.target.value)} style={statusSelectStyle}>
                      {statuses.slice(1).map((value) => <option key={value}>{value}</option>)}
                    </select>
                    <label style={attachButtonStyle}>증빙 첨부<input hidden type="file" onChange={(e) => e.target.files?.[0] && void upload(order.id, e.target.files[0])} /></label>
                    <span style={fileCountStyle}>{order.purchase_files?.length || 0}개</span>
                  </div>
                </div>

                <div style={itemsHeaderStyle}>
                  <div></div><div>상품명</div><div>옵션 / 중국어 원문</div><div>단가</div><div>수량</div><div></div>
                </div>

                {items.map((item: any) => {
                  const koreanName = item.display_name_ko || item.matched_name_ko || "";
                  const isMatched = Boolean(item.matched_name_ko || item.sourcing_inventory_id);
                  return (
                    <div key={item.id} style={itemRowStyle}>
                      <div style={checkCellStyle}>
                        <input type="checkbox" checked={Boolean(selected[item.id])} onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                      </div>
                      <div style={nameCellStyle}>
                        <input
                          value={koreanName}
                          onChange={(e) => editItem(order.id, item.id, e.target.value)}
                          placeholder={isMatched ? "매칭된 한국어 상품명" : "한국어 상품명 입력"}
                          style={koreanNameInputStyle}
                        />
                        {isMatched ? <div style={matchedBadgeStyle}>소싱 매칭됨</div> : <div style={unmatchedTextStyle}>소싱 매칭 없음 · 직접 입력 가능</div>}
                      </div>
                      <div style={originalCellStyle}>
                        <div style={originalNameStyle}>{item.product_name || "-"}</div>
                        {item.option_text ? <div style={optionStyle}>{item.option_text}</div> : null}
                      </div>
                      <div style={priceStyle}>{money(item.unit_price)}위안</div>
                      <div style={qtyStyle}>{item.quantity}개</div>
                      <div><button type="button" onClick={() => void saveItem({ ...item, display_name_ko: koreanName })} disabled={savingItemId === item.id} style={saveButtonStyle}>{savingItemId === item.id ? "저장중" : "저장"}</button></div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

const pageStyle: CSSProperties = { maxWidth: 1500, margin: "0 auto", padding: "28px 24px 48px", color: "#171717", background: "#f7f8fa", minHeight: "100vh" };
const topBarStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 30, letterSpacing: "-0.04em" };
const subtitleStyle: CSSProperties = { margin: "7px 0 0", color: "#6b7280", fontSize: 14 };
const buttonGroupStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const baseButton: CSSProperties = { minHeight: 40, padding: "9px 14px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { ...baseButton, border: "1px solid #d1d5db", color: "#27272a", background: "#fff" };
const primaryButtonStyle: CSSProperties = { ...baseButton, border: "1px solid #111827", color: "#fff", background: "#111827" };
const filterBarStyle: CSSProperties = { display: "flex", gap: 10, alignItems: "center", padding: 14, marginBottom: 14, border: "1px solid #e5e7eb", background: "#fff", borderRadius: 12, flexWrap: "wrap" };
const searchStyle: CSSProperties = { flex: "1 1 360px", minWidth: 220, height: 42, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 12px", fontSize: 14 };
const selectStyle: CSSProperties = { height: 42, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 34px 0 11px", background: "#fff", fontSize: 14 };
const countStyle: CSSProperties = { marginLeft: "auto", color: "#6b7280", fontSize: 13, fontWeight: 700 };
const messageStyle: CSSProperties = { marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", fontSize: 13 };
const orderBoxStyle: CSSProperties = { background: "#fff", border: "1px solid #e1e4e8", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.025)" };
const orderHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 16px", background: "#f8f9fa", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" };
const orderHeaderTopStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const orderNoStyle: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "#4b5563" };
const shopStyle: CSSProperties = { fontSize: 12, padding: "3px 7px", borderRadius: 5, background: "#fff", border: "1px solid #dfe3e8" };
const orderMetaStyle: CSSProperties = { marginTop: 5, fontSize: 12, color: "#6b7280" };
const orderActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" };
const statusSelectStyle: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", padding: "0 8px", fontSize: 12 };
const attachButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", height: 34, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const fileCountStyle: CSSProperties = { fontSize: 11, color: "#71717a" };
const itemsHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px minmax(210px,1.1fr) minmax(330px,1.7fr) 90px 55px 68px", gap: 10, padding: "9px 14px", background: "#fff", color: "#71717a", fontSize: 11, fontWeight: 800, borderBottom: "1px solid #eef0f2" };
const itemRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px minmax(210px,1.1fr) minmax(330px,1.7fr) 90px 55px 68px", gap: 10, alignItems: "center", padding: "11px 14px", borderBottom: "1px solid #eef0f2" };
const checkCellStyle: CSSProperties = { textAlign: "center" };
const nameCellStyle: CSSProperties = { minWidth: 0 };
const koreanNameInputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", height: 36, padding: "0 10px", border: "1px solid #cfd4da", borderRadius: 7, fontSize: 13, fontWeight: 700 };
const matchedBadgeStyle: CSSProperties = { display: "inline-block", marginTop: 5, padding: "2px 6px", borderRadius: 4, background: "#eef6ff", color: "#245a91", fontSize: 10, fontWeight: 800 };
const unmatchedTextStyle: CSSProperties = { marginTop: 4, color: "#9a6700", fontSize: 10 };
const originalCellStyle: CSSProperties = { minWidth: 0 };
const originalNameStyle: CSSProperties = { fontSize: 12, color: "#374151", lineHeight: 1.4 };
const optionStyle: CSSProperties = { marginTop: 4, fontSize: 11, color: "#71717a", lineHeight: 1.4 };
const priceStyle: CSSProperties = { fontSize: 12, whiteSpace: "nowrap", fontWeight: 700 };
const qtyStyle: CSSProperties = { fontSize: 12, whiteSpace: "nowrap" };
const saveButtonStyle: CSSProperties = { height: 34, padding: "0 11px", border: "1px solid #111827", borderRadius: 7, background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 800 };
const emptyStyle: CSSProperties = { padding: 40, textAlign: "center", color: "#71717a", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 };
