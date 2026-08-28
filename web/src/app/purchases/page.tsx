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
          item.product_name,
          item.option_text,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [orders, q, status]);

  async function update(order: any, nextStatus: string) {
    setMsg("");
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: order.id,
        order_status: nextStatus,
        memo: order.memo,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setMsg(json.message || "상태 저장 실패");
      return;
    }

    setOrders((prev) =>
      prev.map((row) =>
        row.id === order.id ? { ...row, order_status: nextStatus } : row
      )
    );
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
      setMsg(json.message || "엑셀 생성 실패");
      return;
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

    const res = await fetch("/api/purchases/files", {
      method: "POST",
      body: fd,
    });

    setMsg(res.ok ? "첨부파일 저장 완료" : "첨부 실패");
    if (res.ok) void load();
  }

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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="주문번호 / 판매처 / 상품명 검색"
          style={searchStyle}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <div style={countStyle}>{filtered.length.toLocaleString()}건</div>
      </section>

      {msg ? <div style={messageStyle}>{msg}</div> : null}

      <section style={tableCardStyle}>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>주문일</th>
                <th style={thStyle}>주문번호 / 판매처</th>
                <th style={thStyle}>상품</th>
                <th style={thStyle}>수량</th>
                <th style={thStyle}>상품합계</th>
                <th style={thStyle}>실결제</th>
                <th style={thStyle}>운송장</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>증빙</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={emptyStyle}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={emptyStyle}>조건에 맞는 매입 주문이 없습니다.</td></tr>
              ) : (
                filtered.map((order) => {
                  const items = order.purchase_items || [];
                  const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
                  const itemTotal = items.reduce((sum: number, item: any) => sum + Number(item.line_total || 0), 0);
                  const first = items[0];
                  const firstName = first?.display_name_ko || first?.product_name || "상품명 없음";
                  const extra = Math.max(0, items.length - 1);

                  return (
                    <tr key={order.id} style={trStyle}>
                      <td style={tdStyle}>
                        <div style={dateStyle}>{order.ordered_at ? String(order.ordered_at).slice(0, 10) : "-"}</div>
                        <div style={mutedStyle}>{order.country || "CN"}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={orderNoStyle}>{order.order_number || "-"}</div>
                        <div style={mutedStyle}>{order.shop_name || order.source_site || "-"}</div>
                      </td>
                      <td style={{ ...tdStyle, minWidth: 280 }}>
                        <div style={itemTitleStyle}>{firstName}{extra > 0 ? ` 외 ${extra}종` : ""}</div>
                        {first?.option_text ? <div style={mutedStyle}>{first.option_text}</div> : null}
                        {items.length > 1 ? (
                          <details style={{ marginTop: 6 }}>
                            <summary style={detailSummaryStyle}>전체 상품 보기</summary>
                            <div style={detailBoxStyle}>
                              {items.map((item: any) => (
                                <div key={item.id} style={detailRowStyle}>
                                  <div>
                                    <b>{item.display_name_ko || item.product_name || "상품명 없음"}</b>
                                    {item.option_text ? <div style={mutedStyle}>{item.option_text}</div> : null}
                                  </div>
                                  <div style={{ whiteSpace: "nowrap" }}>{money(item.unit_price)}위안 × {item.quantity}개</div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{totalQty}</td>
                      <td style={tdStyle}>{money(itemTotal)}위안</td>
                      <td style={tdStyle}>
                        <b>{money(order.paid_amount)}위안</b>
                        <div style={mutedStyle}>배송 {money(order.local_shipping)}위안</div>
                      </td>
                      <td style={tdStyle}>
                        <div>{order.tracking_number || "-"}</div>
                        <div style={mutedStyle}>{order.tracking_company || ""}</div>
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={order.order_status || "주문완료"}
                          onChange={(e) => void update(order, e.target.value)}
                          style={statusSelectStyle}
                        >
                          {statuses.slice(1).map((value) => <option key={value}>{value}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <label style={attachButtonStyle}>
                          첨부
                          <input
                            hidden
                            type="file"
                            onChange={(e) => e.target.files?.[0] && void upload(order.id, e.target.files[0])}
                          />
                        </label>
                        <div style={mutedStyle}>{order.purchase_files?.length || 0}개</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
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
const searchStyle: CSSProperties = { flex: "1 1 360px", minWidth: 220, height: 42, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 12px", fontSize: 14, outline: "none" };
const selectStyle: CSSProperties = { height: 42, border: "1px solid #d1d5db", borderRadius: 8, padding: "0 34px 0 11px", background: "#fff", fontSize: 14 };
const countStyle: CSSProperties = { marginLeft: "auto", color: "#6b7280", fontSize: 13, fontWeight: 700 };
const messageStyle: CSSProperties = { marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e5e7eb", fontSize: 13 };
const tableCardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" };
const tableScrollStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: 1180, borderCollapse: "collapse", fontSize: 13 };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 14px", background: "#f9fafb", color: "#52525b", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800 };
const trStyle: CSSProperties = { borderBottom: "1px solid #eef0f2" };
const tdStyle: CSSProperties = { padding: "13px 14px", verticalAlign: "top", lineHeight: 1.45 };
const dateStyle: CSSProperties = { fontWeight: 700, whiteSpace: "nowrap" };
const mutedStyle: CSSProperties = { color: "#71717a", fontSize: 12, marginTop: 2 };
const orderNoStyle: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, fontWeight: 700, wordBreak: "break-all" };
const itemTitleStyle: CSSProperties = { fontWeight: 800, fontSize: 13 };
const statusSelectStyle: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", padding: "0 8px", fontSize: 12 };
const attachButtonStyle: CSSProperties = { display: "inline-flex", alignItems: "center", height: 32, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const detailSummaryStyle: CSSProperties = { cursor: "pointer", color: "#4b5563", fontSize: 12, fontWeight: 700 };
const detailBoxStyle: CSSProperties = { marginTop: 7, padding: "8px 10px", background: "#f9fafb", borderRadius: 8, border: "1px solid #eceff3" };
const detailRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: "1px solid #eceff3" };
const emptyStyle: CSSProperties = { padding: 40, textAlign: "center", color: "#71717a" };
