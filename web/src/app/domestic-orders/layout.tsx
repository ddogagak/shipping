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
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void fetch("/api/domestic/orders", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => setOrders(Array.isArray(json.orders) ? json.orders : []))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    function onDoubleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest("td") as HTMLTableCellElement | null;
      const row = cell?.closest("tr") as HTMLTableRowElement | null;
      if (!cell || !row || cell.cellIndex !== 1) return;

      const nickname = cell.textContent?.trim() || "";
      if (!nickname) return;

      // 현재 Domestic Orders 표에서 고객주문번호는 12번째 열(index 11)에 표시됨.
      const displayedOrderNo = row.cells[11]?.textContent?.trim() || "";
      const matched =
        orders.find(
          (order) =>
            (order.customer_order_no || order.order_id) === displayedOrderNo &&
            (order.nickname || "").trim() === nickname
        ) || orders.find((order) => (order.nickname || "").trim() === nickname);

      if (matched) {
        setCopied("");
        setSelected(matched);
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

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value || "");
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1200);
  }

  const fullAddress = selected
    ? [selected.postal_code ? `(${selected.postal_code})` : "", selected.address || ""]
        .filter(Boolean)
        .join(" ")
    : "";

  const copyAll = selected
    ? [`이름: ${selected.recipient_name || ""}`, `폰번: ${selected.phone || ""}`, `주소: ${fullAddress}`].join("\n")
    : "";

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

            <InfoRow label="이름" value={selected.recipient_name || ""} onCopy={() => copy("이름", selected.recipient_name || "")} copied={copied === "이름"} />
            <InfoRow label="폰번" value={selected.phone || ""} onCopy={() => copy("폰번", selected.phone || "")} copied={copied === "폰번"} />
            <InfoRow label="주소" value={fullAddress} onCopy={() => copy("주소", fullAddress)} copied={copied === "주소"} multiline />

            <button type="button" onClick={() => copy("전체", copyAll)} style={copyAllButtonStyle}>
              {copied === "전체" ? "전체 복사됨 ✓" : "이름 · 폰번 · 주소 전체 복사"}
            </button>
            <div style={hintStyle}>닉네임을 더블클릭하면 이 창이 열립니다. ESC 또는 바깥 클릭으로 닫을 수 있어요.</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
  multiline = false,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  multiline?: boolean;
}) {
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, whiteSpace: multiline ? "pre-wrap" : "nowrap" }}>{value || "-"}</div>
      <button type="button" onClick={onCopy} style={copyButtonStyle} disabled={!value}>
        {copied ? "복사됨 ✓" : "복사"}
      </button>
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
  gridTemplateColumns: "56px minmax(0, 1fr) 64px",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  borderTop: "1px solid #f3f4f6",
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 900, color: "#374151" };
const valueStyle: CSSProperties = { minWidth: 0, fontSize: 15, color: "#111827", overflowWrap: "anywhere" };

const copyButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "7px 8px",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const copyAllButtonStyle: CSSProperties = {
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
