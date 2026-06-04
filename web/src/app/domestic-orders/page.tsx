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
  { value: "Kuji", label: "Kuji" },
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
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

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

  function makeRowWithPatch(row: Row, patchRow: Partial<Row>, patchShipping?: Partial<ShippingInfo>): Row {
    const currentShipping = shipping(row) || defaultShipping();

    return {
      ...row,
      ...patchRow,
      domestic_shipping: {
        ...currentShipping,
        ...(patchShipping || {}),
      },
    };
  }

  function toggle
