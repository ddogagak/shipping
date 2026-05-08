"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type ShippingInfo = {
  carrier: string | null;
  shipping_type: string | null;
  tracking_number: string | null;
  shipping_status: string | null;
  excel_exported_at: string | null;
};

type DomesticOrder = {
  order_id: string;
  customer_order_no: string | null;
  platform: string;
  source_order_dates: string[] | null;
  first_order_date: string | null;
  nickname: string | null;
  recipient_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  order_count: number | null;
  item_summary: string | null;
  item_total_price: number | null;
  memo: string | null;
  order_status: string | null;
  created_at: string | null;
  domestic_shipping: ShippingInfo | ShippingInfo[] | null;
};

type Row = DomesticOrder & { selected: boolean };

type CombineDraft = {
  orderIds: string[];
  rows: Row[];
  customer_order_no: string;
  first_order_date: string;
  order_count: string;
  item_summary: string;
  item_total_price: string;
  memo: string;
  shipping_type: string;
  tracking_number: string;
};

type SortKey =
  | "platform"
  | "order_id"
  | "nickname"
  | "order_count"
  | "first_order_date"
  | "memo"
  | "order_status"
  | "shipping_status"
  | "shipping_type"
  | "tracking_number"
  | "item_summary"
  | "item_total_price";

type SortDirection = "asc" | "desc";

const PLATFORM_OPTIONS = [
  { value: "wise", label: "Wise" },
  { value: "x", label: "X" },
  { value: "bunjang", label: "번개장터" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "accepted", label: "입력됨" },
  { value: "checked", label: "재고확인" },
  { value: "packaged", label: "포장완료" },
  { value: "done", label: "완료" },
];

const SHIPPING_STATUS_OPTIONS = [
  { value: "start", label: "시작" },
  { value: "excel_exported", label: "엑셀 추출" },
  { value: "uploaded", label: "운송장 입력" },
  { value: "registered", label: "운송장등록" },
  { value: "done", label: "배송완료" },
];

const SHIPPING_TYPE_OPTIONS = [
  { value: "일반택배", label: "일반택배" },
  { value: "GS반값택배", label: "GS반값택배" },
  { value: "준등기", label: "준등기" },
];

const HEADERS = [
  "받는분성명",
  "받는분우편번호",
  "받는분전화번호",
  "받는분주소(전체, 분할)",
  "고객주문번호",
  "품목명",
  "내품명",
  "박스수량",
  "박스타입",
  "기본운임",
  "주문건수",
  "최초주문일",
  "아이템",
  "상품금액합계",
];

function shipping(row: DomesticOrder): ShippingInfo | null {
  if (Array.isArray(row.domestic_shipping)) return row.domestic_shipping[0] || null;
  return row.domestic_shipping || null;
}

function label(options: { value: string; label: string }[], value?: string | null) {
  return options.find((option) => option.value === value)?.label || value || "-";
}

function formatWon(value?: number | null) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function withApostrophe(value?: string | null) {
  const clean = String(value ?? "").trim().replace(/^'+/, "");
  if (!clean) return "";
  return `'${clean}`;
}

function displayOrderNo(row: DomesticOrder) {
  return row.customer_order_no || row.order_id;
}

function contentName(row: DomesticOrder) {
  const prefix = row.platform === "bunjang" ? "스와숍" : "도파민베이커리";
  return `${prefix}-${row.nickname || ""}`;
}

function toExcelRow(row: DomesticOrder) {
  return {
    받는분성명: row.recipient_name || "",
    받는분우편번호: withApostrophe(row.postal_code),
    받는분전화번호: withApostrophe(row.phone),
    "받는분주소(전체, 분할)": row.address || "",
    고객주문번호: displayOrderNo(row),
    품목명: "피규어",
    내품명: contentName(row),
    박스수량: "1",
    박스타입: "1",
    기본운임: "",
    주문건수: String(row.order_count || 1),
    최초주문일: row.first_order_date || "",
    아이템: row.item_summary || "",
    상품금액합계: formatWon(row.item_total_price),
  };
}

function sortValue(row: Row, key: SortKey): string | number {
  const s = shipping(row);

  switch (key) {
    case "platform":
      return row.platform || "";
    case "order_id":
      return displayOrderNo(row);
    case "nickname":
      return row.nickname || "";
    case "order_count":
      return Number(row.order_count || 0);
    case "first_order_date":
      return row.first_order_date || "";
    case "memo":
      return row.memo || "";
    case "order_status":
      return row.order_status || "";
    case "shipping_status":
      return s?.shipping_status || "start";
    case "shipping_type":
      return s?.shipping_type || "일반택배";
    case "tracking_number":
      return s?.tracking_number || "";
    case "item_summary":
      return row.item_summary || "";
    case "item_total_price":
      return Number(row.item_total_price || 0);
    default:
      return "";
  }
}

function compareRows(a: Row, b: Row, key: SortKey, direction: SortDirection) {
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  const factor = direction === "asc" ? 1 : -1;

  if (typeof aValue === "number" && typeof bValue === "number") {
    return (aValue - bValue) * factor;
  }

  return String(aValue).localeCompare(String(bValue), "ko") * factor;
}

function shortOrderNo(value?: string | null) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.length > 5 ? clean.slice(-5) : clean;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function defaultShipping(): ShippingInfo {
  return {
    carrier: "우체국택배",
    shipping_type: "일반택배",
    tracking_number: null,
    shipping_status: "start",
    excel_exported_at: null,
  };
}

export default function DomesticOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [platforms, setPlatforms] = useState<string[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<string[]>(["accepted", "checked", "packaged"]);
  const [shippingStatuses, setShippingStatuses] = useState<string[]>([
    "start",
    "excel_exported",
    "uploaded",
    "registered",
  ]);
  const [shippingTypes, setShippingTypes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("first_order_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [combineDraft, setCombineDraft] = useState<CombineDraft | null>(null);

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/domestic/orders", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "조회 실패");
        return;
      }

      setRows(
        (json.orders || []).map((row: DomesticOrder) => ({
          ...row,
          selected: false,
        }))
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const s = shipping(row);
        const shippingStatus = s?.shipping_status || "start";
        const shippingType = s?.shipping_type || "일반택배";

        if (platforms.length && !platforms.includes(row.platform)) return false;
        if (orderStatuses.length && !orderStatuses.includes(row.order_status || "accepted")) return false;
        if (shippingStatuses.length && !shippingStatuses.includes(shippingStatus)) return false;
        if (shippingTypes.length && !shippingTypes.includes(shippingType)) return false;

        if (q.trim()) {
          const text = [
            row.order_id,
            row.customer_order_no,
            row.platform,
            row.nickname,
            row.recipient_name,
            row.phone,
            row.postal_code,
            row.address,
            row.first_order_date,
            row.item_summary,
            row.memo,
            s?.tracking_number,
            shippingType,
          ]
            .join(" ")
            .toLowerCase();

          if (!text.includes(q.trim().toLowerCase())) return false;
        }

        return true;
      })
      .sort((a, b) => compareRows(a, b, sortKey, sortDirection));
  }, [rows, platforms, orderStatuses, shippingStatuses, shippingTypes, q, sortKey, sortDirection]);

  const selectedIds = rows.filter((row) => row.selected).map((row) => row.order_id);
  const selectedRows = rows.filter((row) => row.selected);
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => row.selected);

  const combineCandidates = useMemo(() => {
    const groups = new Map<string, Row[]>();

    rows.forEach((row) => {
      const s = shipping(row);
      const nickname = String(row.nickname || "").trim();
      const orderDone = (row.order_status || "") === "done";
      const shippingDone = (s?.shipping_status || "") === "done";

      if (!nickname || orderDone || shippingDone) return;

      const list = groups.get(nickname) || [];
      list.push(row);
      groups.set(nickname, list);
    });

    return Array.from(groups.entries())
      .map(([nickname, list]) => {
        const sorted = [...list].sort((a, b) =>
          String(a.first_order_date || a.created_at || "").localeCompare(
            String(b.first_order_date || b.created_at || "")
          )
        );
        const dateSet = new Set(sorted.map((row) => row.first_order_date || "날짜없음"));
        return { nickname, rows: sorted, dateCount: dateSet.size };
      })
      .filter((group) => group.rows.length >= 2 && group.dateCount >= 2);
  }, [rows]);

  function toggleList(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function updateSelected(orderId: string, selected: boolean) {
    setRows((prev) =>
      prev.map((row) => (row.order_id === orderId ? { ...row, selected } : row))
    );
  }

  function updateRowValue(orderId: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((row) => (row.order_id === orderId ? { ...row, ...patch } : row))
    );
  }

  function updateShippingValue(orderId: string, patch: Partial<ShippingInfo>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.order_id !== orderId) return row;
        const current = shipping(row) || defaultShipping();
        return {
          ...row,
          domestic_shipping: {
            ...current,
            ...patch,
          },
        };
      })
    );
  }

  function toggleAllFiltered(checked: boolean) {
    const ids = new Set(filteredRows.map((row) => row.order_id));
    setRows((prev) =>
      prev.map((row) => (ids.has(row.order_id) ? { ...row, selected: checked } : row))
    );
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  async function patch(action: string) {
    if (!selectedIds.length) {
      alert("선택된 주문이 없어.");
      return;
    }

    const res = await fetch("/api/domestic/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: selectedIds, action }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "상태 변경 실패");
      return;
    }

    await load();
  }

  function openCombineDraft(groupRows: Row[]) {
    if (groupRows.length < 2) {
      alert("합배송할 주문이 2건 이상이어야 해.");
      return;
    }

    const sorted = [...groupRows].sort((a, b) =>
      String(a.first_order_date || a.created_at || "").localeCompare(
        String(b.first_order_date || b.created_at || "")
      )
    );

    const trackingNumbers = uniqueStrings(sorted.map((row) => shipping(row)?.tracking_number));
    const shippingTypes = uniqueStrings(sorted.map((row) => shipping(row)?.shipping_type));
    const combinedDates = uniqueStrings(
      sorted.flatMap((row) =>
        Array.isArray(row.source_order_dates) && row.source_order_dates.length
          ? row.source_order_dates
          : [row.first_order_date]
      )
    ).sort();

    setCombineDraft({
      orderIds: sorted.map((row) => row.order_id),
      rows: sorted,
      customer_order_no: sorted
        .map((row) => shortOrderNo(row.customer_order_no || row.order_id))
        .filter(Boolean)
        .join("-"),
      first_order_date: combinedDates[0] || sorted[0]?.first_order_date || "",
      order_count: String(sorted.reduce((sum, row) => sum + Number(row.order_count || 1), 0)),
      item_summary: sorted
        .map((row) => String(row.item_summary || "").trim())
        .filter(Boolean)
        .join(" / "),
      item_total_price: String(sorted.reduce((sum, row) => sum + Number(row.item_total_price || 0), 0)),
      memo: [
        String(sorted[0]?.memo || "").trim(),
        `합배송: ${sorted.map((row) => row.customer_order_no || row.order_id).join(" + ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
      shipping_type: shippingTypes[0] || "일반택배",
      tracking_number: trackingNumbers[0] || "",
    });
  }

  async function submitCombineDraft() {
    if (!combineDraft) return;
    if (combineDraft.orderIds.length < 2) {
      alert("합배송할 주문이 2건 이상이어야 해.");
      return;
    }

    if (!confirm(`확인한 ${combineDraft.orderIds.length}건을 합배송으로 저장할까?`)) return;

    const res = await fetch("/api/domestic/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_ids: combineDraft.orderIds,
        action: "combine_shipping",
        combined: {
          customer_order_no: combineDraft.customer_order_no,
          first_order_date: combineDraft.first_order_date,
          order_count: Number(combineDraft.order_count || 0),
          item_summary: combineDraft.item_summary,
          item_total_price: Number(combineDraft.item_total_price || 0),
          memo: combineDraft.memo,
          shipping_type: combineDraft.shipping_type,
          tracking_number: combineDraft.tracking_number,
        },
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "합배송 처리 실패");
      return;
    }

    alert(json.message || "합배송 처리 완료");
    setCombineDraft(null);
    await load();
  }

  function updateCombineDraft(patch: Partial<CombineDraft>) {
    setCombineDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveRow(row: Row) {
    const s = shipping(row) || defaultShipping();

    const res = await fetch("/api/domestic/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_row",
        order_id: row.order_id,
        memo: row.memo || "",
        order_status: row.order_status || "accepted",
        shipping_status: s.shipping_status || "start",
        shipping_type: s.shipping_type || "일반택배",
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "저장 실패");
      return;
    }

    await load();
  }

  async function deleteSelected() {
    if (!selectedIds.length) {
      alert("삭제할 주문을 선택해줘.");
      return;
    }

    if (!confirm(`선택 ${selectedIds.length}건을 삭제할까?`)) return;

    const res = await fetch("/api/domestic/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: selectedIds }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "삭제 실패");
      return;
    }

    await load();
  }

  async function exportExcel() {
    if (!selectedRows.length) {
      alert("엑셀 추출할 주문을 선택해줘.");
      return;
    }

    const data = selectedRows.map(toExcelRow);
    const worksheet = XLSX.utils.json_to_sheet(data, { header: HEADERS });

    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 48 },
      { wch: 18 },
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 80 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "국내배송");

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(
      2,
      "0"
    )}${String(now.getMinutes()).padStart(2, "0")}`;

    XLSX.writeFile(workbook, `domestic_shipping_${stamp}.xlsx`);
    await patch("excel_exported");
  }

  function exportTrackingExcel() {
    const data = filteredRows
      .filter((row) => {
        const s = shipping(row);
        return s?.tracking_number;
      })
      .map((row) => {
        const s = shipping(row);

        return {
          운송장번호: s?.tracking_number ?? "",
          주문번호: displayOrderNo(row),
        };
      });

    if (!data.length) {
      alert("다운로드할 운송장 번호가 없어.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data, {
      skipHeader: true,
    });

    worksheet["!cols"] = [{ wch: 24 }, { wch: 24 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "운송장");

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(
      2,
      "0"
    )}${String(now.getMinutes()).padStart(2, "0")}`;

    XLSX.writeFile(workbook, `domestic_tracking_${stamp}.xlsx`);
  }


  return (
    <main style={{ maxWidth: 1600, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <div style={topHeaderStyle}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Domestic Orders</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>
              국내 주문 조회, 필터, 상태 변경, 엑셀 재추출 화면입니다.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={homeButtonStyle}>
              홈으로
            </Link>
            <Link href="/domestic-tracking" style={homeButtonStyle}>
              운송장등록
            </Link>
          </div>
        </div>

        {message ? <p style={{ color: "#b91c1c" }}>{message}</p> : null}

        <div style={summaryGridStyle}>
          <Summary label="전체" value={rows.length} />
          <Summary label="현재 표시" value={filteredRows.length} />
          <Summary label="선택" value={selectedIds.length} />
          <Summary
            label="배송완료"
            value={rows.filter((row) => shipping(row)?.shipping_status === "done").length}
          />
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>필터</h2>

        <FilterGroup
          title="플랫폼"
          options={PLATFORM_OPTIONS}
          selected={platforms}
          onToggle={(value) => setPlatforms((prev) => toggleList(prev, value))}
        />
        <FilterGroup
          title="주문상태"
          options={ORDER_STATUS_OPTIONS}
          selected={orderStatuses}
          onToggle={(value) => setOrderStatuses((prev) => toggleList(prev, value))}
        />
        <FilterGroup
          title="배송상태"
          options={SHIPPING_STATUS_OPTIONS}
          selected={shippingStatuses}
          onToggle={(value) => setShippingStatuses((prev) => toggleList(prev, value))}
        />
        <FilterGroup
          title="배송수단"
          options={SHIPPING_TYPE_OPTIONS}
          selected={shippingTypes}
          onToggle={(value) => setShippingTypes((prev) => toggleList(prev, value))}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="고객주문번호, 닉네임, 아이템, 메모, 운송장 검색"
            style={searchInputStyle}
          />
          <button type="button" onClick={() => void load()} style={blackButtonStyle}>
            새로고침
          </button>
        </div>
      </section>

      {combineCandidates.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>합배송 제안</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
                배송완료가 아니고, 닉네임이 같고, 주문일이 다른 주문만 표시됩니다.
              </p>
            </div>
            <strong>{combineCandidates.length}건</strong>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {combineCandidates.map((group) => {
              const orderIds = group.rows.map((row) => row.order_id);
              const dates = Array.from(
                new Set(group.rows.map((row) => row.first_order_date || "날짜없음"))
              ).join(" / ");
              const totalCount = group.rows.reduce((sum, row) => sum + Number(row.order_count || 1), 0);
              const totalPrice = group.rows.reduce((sum, row) => sum + Number(row.item_total_price || 0), 0);

              return (
                <div key={group.nickname} style={combineCardStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>
                      {group.nickname} · {group.rows.length}건 · 총 {totalCount}개
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 6 }}>
                      주문일: {dates} / 상품합계: {formatWon(totalPrice)}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {group.rows.map((row) => displayOrderNo(row)).join(" + ")}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openCombineDraft(group.rows)}
                    style={purpleButtonStyle}
                  >
                    합배송 확인
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {combineDraft ? (
        <section style={{ ...cardStyle, marginTop: 16, borderColor: "#7c3aed" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>합배송 확인 / 수정</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
                저장 전 모든 값을 확인하고 수정할 수 있습니다. 운송장은 기존 값이 있으면 자동 반영되고, 여러 개면 아래에서 선택하세요.
              </p>
            </div>
            <button type="button" onClick={() => setCombineDraft(null)} style={redButtonStyle}>
              닫기
            </button>
          </div>

          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>주문번호</th>
                  <th style={thStyle}>주문일</th>
                  <th style={thStyle}>닉네임</th>
                  <th style={thStyle}>주문건수</th>
                  <th style={thStyle}>배송상태</th>
                  <th style={thStyle}>배송수단</th>
                  <th style={thStyle}>운송장</th>
                  <th style={thStyle}>아이템</th>
                  <th style={thStyle}>상품합계</th>
                </tr>
              </thead>
              <tbody>
                {combineDraft.rows.map((row) => {
                  const s = shipping(row) || defaultShipping();
                  return (
                    <tr key={row.order_id}>
                      <td style={tdStyle}>{displayOrderNo(row)}</td>
                      <td style={tdStyle}>{row.first_order_date || ""}</td>
                      <td style={tdStyle}>{row.nickname || ""}</td>
                      <td style={tdStyle}>{row.order_count || 1}</td>
                      <td style={tdStyle}>{label(SHIPPING_STATUS_OPTIONS, s.shipping_status || "start")}</td>
                      <td style={tdStyle}>{s.shipping_type || "일반택배"}</td>
                      <td style={tdStyle}>{s.tracking_number || ""}</td>
                      <td style={{ ...tdStyle, minWidth: 300 }}>{row.item_summary || ""}</td>
                      <td style={tdStyle}>{formatWon(row.item_total_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {uniqueStrings(combineDraft.rows.map((row) => shipping(row)?.tracking_number)).length > 1 ? (
            <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd6fe", borderRadius: 12, background: "#faf5ff" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>기존 운송장이 여러 개 있습니다. 사용할 운송장을 선택하세요.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {uniqueStrings(combineDraft.rows.map((row) => shipping(row)?.tracking_number)).map((tracking) => (
                  <label key={tracking} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
                    <input
                      type="radio"
                      name="combineTracking"
                      checked={combineDraft.tracking_number === tracking}
                      onChange={() => updateCombineDraft({ tracking_number: tracking })}
                    />
                    {tracking}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div style={combineFormGridStyle}>
            <label style={formLabelStyle}>
              합배송 주문번호
              <input
                value={combineDraft.customer_order_no}
                onChange={(event) => updateCombineDraft({ customer_order_no: event.target.value })}
                style={wideInputStyle}
              />
            </label>

            <label style={formLabelStyle}>
              최초주문일
              <input
                value={combineDraft.first_order_date}
                onChange={(event) => updateCombineDraft({ first_order_date: event.target.value })}
                style={wideInputStyle}
              />
            </label>

            <label style={formLabelStyle}>
              주문건수
              <input
                value={combineDraft.order_count}
                onChange={(event) => updateCombineDraft({ order_count: event.target.value })}
                style={wideInputStyle}
              />
            </label>

            <label style={formLabelStyle}>
              상품금액합계
              <input
                value={combineDraft.item_total_price}
                onChange={(event) => updateCombineDraft({ item_total_price: event.target.value })}
                style={wideInputStyle}
              />
            </label>

            <label style={formLabelStyle}>
              배송수단
              <select
                value={combineDraft.shipping_type}
                onChange={(event) => updateCombineDraft({ shipping_type: event.target.value })}
                style={wideInputStyle}
              >
                {SHIPPING_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={formLabelStyle}>
              운송장번호
              <input
                value={combineDraft.tracking_number}
                onChange={(event) => updateCombineDraft({ tracking_number: event.target.value })}
                style={wideInputStyle}
                placeholder="기존 운송장이 없으면 비워둬도 됨"
              />
            </label>
          </div>

          <label style={{ ...formLabelStyle, marginTop: 12 }}>
            아이템
            <textarea
              value={combineDraft.item_summary}
              onChange={(event) => updateCombineDraft({ item_summary: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <label style={{ ...formLabelStyle, marginTop: 12 }}>
            메모
            <textarea
              value={combineDraft.memo}
              onChange={(event) => updateCombineDraft({ memo: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" onClick={() => setCombineDraft(null)} style={redButtonStyle}>
              취소
            </button>
            <button type="button" onClick={submitCombineDraft} style={purpleButtonStyle}>
              확인 후 합배송 저장
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={actionBarStyle}>
          <div style={{ fontWeight: 800 }}>선택 {selectedIds.length}건</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={exportExcel} style={blackButtonStyle}>
              선택 {selectedIds.length}건 엑셀 추출
            </button>
            <button type="button" onClick={exportTrackingExcel} style={blueButtonStyle}>
              운송장다운로드
            </button>
            <button type="button" onClick={deleteSelected} style={redButtonStyle}>
              선택 {selectedIds.length}건 삭제
            </button>
            <button type="button" onClick={() => patch("packaged")} style={orangeButtonStyle}>
              포장완료 처리
            </button>
            <button type="button" onClick={() => patch("registered")} style={purpleButtonStyle}>
              운송장등록 처리
            </button>
            <button type="button" onClick={() => patch("done")} style={greenButtonStyle}>
              배송완료 처리
            </button>
          </div>
        </div>

        {loading ? (
          <p>불러오는 중...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 1650,
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(event) => toggleAllFiltered(event.target.checked)}
                    />
                  </th>
                  <SortableTh label="플랫폼" sortKeyValue="platform" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="고객주문번호" sortKeyValue="order_id" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="닉네임" sortKeyValue="nickname" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="주문건수" sortKeyValue="order_count" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="최초주문일" sortKeyValue="first_order_date" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="메모" sortKeyValue="memo" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <th style={thStyle}>저장</th>
                  <SortableTh label="주문상태" sortKeyValue="order_status" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="배송상태" sortKeyValue="shipping_status" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="배송수단" sortKeyValue="shipping_type" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="운송장" sortKeyValue="tracking_number" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="아이템" sortKeyValue="item_summary" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                  <SortableTh label="상품합계" sortKeyValue="item_total_price" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const s = shipping(row) || defaultShipping();

                  return (
                    <tr key={row.order_id}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(event) => updateSelected(row.order_id, event.target.checked)}
                        />
                      </td>
                      <td style={tdStyle}>{label(PLATFORM_OPTIONS, row.platform)}</td>
                      <td style={tdStyle}>{displayOrderNo(row)}</td>
                      <td style={tdStyle}>{row.nickname || ""}</td>
                      <td style={tdStyle}>{row.order_count || 1}</td>
                      <td style={tdStyle}>{row.first_order_date || ""}</td>

                      <td style={tdStyle}>
                        <input
                          value={row.memo || ""}
                          onChange={(event) => updateRowValue(row.order_id, { memo: event.target.value })}
                          style={memoInputStyle}
                        />
                      </td>

                      <td style={tdStyle}>
                        <button type="button" onClick={() => saveRow(row)} style={smallSaveButtonStyle}>
                          저장
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={row.order_status || "accepted"}
                          onChange={(event) =>
                            updateRowValue(row.order_id, { order_status: event.target.value })
                          }
                          style={selectStyle}
                        >
                          {ORDER_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={s.shipping_status || "start"}
                          onChange={(event) =>
                            updateShippingValue(row.order_id, { shipping_status: event.target.value })
                          }
                          style={selectStyle}
                        >
                          {SHIPPING_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={s.shipping_type || "일반택배"}
                          onChange={(event) =>
                            updateShippingValue(row.order_id, { shipping_type: event.target.value })
                          }
                          style={selectStyle}
                        >
                          {SHIPPING_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td style={tdStyle}>{s.tracking_number || ""}</td>

                      <td
                        style={{
                          ...tdStyle,
                          minWidth: 360,
                          maxWidth: 520,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={row.item_summary || ""}
                      >
                        {row.item_summary || ""}
                      </td>

                      <td style={tdStyle}>{formatWon(row.item_total_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <strong style={{ fontSize: 28 }}>{value}</strong>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((option) => {
          const active = selected.includes(option.value);

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              style={filterButtonStyle(active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKeyValue,
  sortKey,
  direction,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === sortKeyValue;

  return (
    <th style={thStyle}>
      <button type="button" onClick={() => onSort(sortKeyValue)} style={sortButtonStyle}>
        {label} {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </button>
    </th>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const combineCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  background: "#fafafa",
};

const topHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const homeButtonStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#111827",
  fontWeight: 800,
  background: "#fff",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginTop: 18,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 340px",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
};

const blackButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const blueButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#2563eb" };
const purpleButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#7c3aed" };
const greenButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#059669" };
const redButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#dc2626" };
const orangeButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#ea580c" };

const smallSaveButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: "7px 10px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const memoInputStyle: CSSProperties = {
  width: 220,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "6px 8px",
};

const selectStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "6px 8px",
  background: "#fff",
};

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    borderRadius: 999,
    padding: "8px 12px",
    background: active ? "#2563eb" : "#fff",
    color: active ? "#fff" : "#111827",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const sortButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const combineFormGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const formLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  fontSize: 13,
};

const wideInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 78,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
  verticalAlign: "top",
};
