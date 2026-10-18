"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type Order = {
  order_id: string;
  customer_order_no: string | null;
  nickname: string | null;
  recipient_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
};

export default function DomesticOrdersLayout({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/domestic/orders", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setOrders(Array.isArray(json.orders) ? json.orders : []))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    async function onDoubleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest("td") as HTMLTableCellElement | null;
      const row = cell?.closest("tr") as HTMLTableRowElement | null;
      if (!cell || !row || cell.cellIndex !== 1) return;

      // Use the real DB key instead of a brittle column index or nickname fallback.
      const orderId = row.dataset.orderId?.trim();
      if (!orderId) return;
      try {
        // Always show current DB delivery information, not the layout's mount-time cache.
        const res = await fetch("/api/domestic/orders", { cache: "no-store" });
        if (!res.ok) throw new Error("배송정보 조회 실패");
        const json = await res.json();
        const latestOrders = Array.isArray(json.orders) ? json.orders as Order[] : [];
        const matched = latestOrders.find((order) => order.order_id === orderId);
        if (!matched) throw new Error("선택한 주문을 최신 DB에서 찾지 못했어.");
        setOrders(latestOrders);
        setSelected(matched);
        setRecipientName(matched.recipient_name || "");
        setPhone(matched.phone || "");
        setAddress(matched.address || "");
      } catch (err) {
        alert(err instanceof Error ? err.message : "배송정보 최신 조회 실패");
      }
    }

    document.addEventListener("dblclick", onDoubleClick);
    return () => document.removeEventListener("dblclick", onDoubleClick);
  }, [orders]);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  async function saveDeliveryInfo() {
    if (!selected) return;

    setSaving(true);
    try {
      const res = await fetch("/api/domestic/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_delivery_info",
          order_id: selected.order_id,
          recipient_name: recipientName,
          phone,
          address,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.detail || json.error || "배송정보 저장 실패");
        return;
      }

      const updated = { ...selected, ...json.order };
      setSelected(updated);
      setOrders((prev) =>
        prev.map((order) => (order.order_id === selected.order_id ? { ...order, ...json.order } : order))
      );
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {children}

      {selected ? (
        <div style={backdropStyle} onMouseDown={() => setSelected(null)}>
          <div style={modalStyle} onMouseDown={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <div style={eyebrowStyle}>배송정보</div>
                <h2 style={{ margin: "2px 0 0", fontSize: 22 }}>{selected.nickname || "고객정보"}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={closeButtonStyle} aria-label="닫기">
                ×
              </button>
            </div>

            <EditRow label="이름">
              <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} style={inputStyle} />
            </EditRow>
            <EditRow label="폰번">
              <input value={phone} onChange={(event) => setPhone(event.target.value)} style={inputStyle} />
            </EditRow>
            <EditRow label="주소">
              <textarea value={address} onChange={(event) => setAddress(event.target.value)} style={textareaStyle} />
            </EditRow>

            <button type="button" onClick={() => void saveDeliveryInfo()} style={saveButtonStyle} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </button>
            <div style={hintStyle}>닉네임을 더블클릭하면 배송정보를 수정할 수 있습니다. ESC 또는 바깥 클릭으로 닫을 수 있어요.</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function EditRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(17, 24, 39, 0.42)",
};

const modalStyle: CSSProperties = {
  width: "min(560px, 100%)",
  borderRadius: 18,
  padding: 20,
  background: "#fff",
  boxShadow: "0 24px 70px rgba(0,0,0,.24)",
  border: "1px solid #e5e7eb",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
};

const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 800, color: "#6b7280" };

const closeButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: 0,
  borderRadius: 9,
  background: "#f3f4f6",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "56px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  borderTop: "1px solid #f3f4f6",
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#374151" };
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 15,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
  fontFamily: "inherit",
};

const saveButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 14,
  border: 0,
  borderRadius: 10,
  padding: "11px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const hintStyle: CSSProperties = {
  marginTop: 10,
  textAlign: "center",
  color: "#9ca3af",
  fontSize: 11,
};
