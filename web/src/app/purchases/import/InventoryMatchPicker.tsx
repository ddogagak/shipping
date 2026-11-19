"use client";

import { useMemo, useState, type CSSProperties } from "react";

export type InventoryMatch = {
  id: string;
  match_source?: "sale";
  original_name?: string | null;
  option_text?: string | null;
  view_status?: string | null;
  item_name: string;
  series_name: string | null;
  item_type: string | null;
  image_url: string | null;
  lineup_image_url: string | null;
  source_url: string | null;
  source_product_id: string | null;
  internal_sku: string | null;
  option_seq: number | null;
  component_count: number | null;
  order_number: string | null;
};

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const words = (value: unknown) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
const smallButton: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "white",
  padding: "6px 10px",
  fontWeight: 700,
  cursor: "pointer",
};

export default function InventoryMatchPicker({
  item,
  inventory,
  onSelect,
}: {
  item: {
    product_name: string;
    option_text?: string;
    series_name?: string;
    sourcing_inventory_id?: string;
    matched_sale_purchase_item_id?: string;
  };
  inventory: InventoryMatch[];
  onSelect: (match: InventoryMatch | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "inventory" | "sale">("all");
  const selected = inventory.find(
    (row) => row.match_source === "sale" ? row.id === item.matched_sale_purchase_item_id : row.id === item.sourcing_inventory_id,
  );
  const candidates = useMemo(() => {
    if (!open) return [];
    const typed = words(query);
    const name = normalize(item.product_name);
    const nameWords = words(item.product_name);
    const option = normalize(item.option_text);
    return inventory
      .map((row) => {
        if (source !== "all" && (row.match_source || "inventory") !== source) return null;
        const rowName = normalize(row.item_name);
        const originalName = normalize(row.original_name);
        const haystack = normalize(
          [
            row.item_name,
            row.original_name,
            row.option_text,
            row.series_name,
            row.item_type,
            row.internal_sku,
            row.source_product_id,
            row.order_number,
            row.source_url,
          ].join(" "),
        );
        if (typed.length && !typed.every((word) => haystack.includes(word)))
          return null;
        let score = 0;
        if (name && (rowName === name || originalName === name)) score += 100;
        else if (
          name &&
          rowName &&
          (rowName.includes(name) || name.includes(rowName))
        )
          score += 50;
        score +=
          nameWords.filter((word) => word.length >= 2 && (rowName.includes(word) || originalName.includes(word)))
            .length * 8;
        if (!typed.length && score === 0) return null;
        if (option && rowName.includes(option)) score += 12;
        if (item.series_name && item.series_name === row.series_name)
          score += 5;
        return { row, score };
      })
      .filter(
        (entry): entry is { row: InventoryMatch; score: number } =>
          entry !== null,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.row.item_name || "").localeCompare(
            String(b.row.item_name || ""),
            "ko",
          ),
      )
      .slice(0, 12)
      .map((entry) => entry.row);
  }, [
    inventory,
    item.product_name,
    item.option_text,
    item.series_name,
    open,
    query,
    source,
  ]);

  return (
    <div
      style={{
        border: "1px solid #dbe4ee",
        background: "#f8fafc",
        padding: 10,
        borderRadius: 9,
        margin: "0 0 12px",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <b style={{ fontSize: 13 }}>기존 상품 매칭</b>
        <span
          style={{
            fontSize: 12,
            color: selected ? "#047857" : "#64748b",
            fontWeight: 700,
          }}
        >
          {selected ? "재입고 연결됨" : "미매칭 · 신규 상품 등록 가능"}
        </span>
        <button
          type="button"
          style={smallButton}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "검색 닫기" : selected ? "다른 상품 선택" : "기존 상품 검색"}
        </button>
        {selected && (
          <button
            type="button"
            style={smallButton}
            onClick={() => onSelect(null)}
          >
            연결 해제
          </button>
        )}
      </div>
      {selected && <MatchRow row={selected} />}
      {open && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([ ["all", "전체"], ["inventory", "소싱 인벤토리"], ["sale", "방송판매재고"] ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={source === value} style={{ ...smallButton, background: source === value ? "#dbeafe" : "white" }} onClick={() => setSource(value)}>{label}</button>
            ))}
          </div>
          <input
            aria-label="인벤토리 검색"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명, 작품명, 관리 SKU, 상품번호 검색"
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 7,
              padding: 9,
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <small style={{ color: "#64748b" }}>
            {query.trim() ? "검색 결과" : "상품명 기반 추천 후보"} · 정확한
            옵션을 확인하고 선택해줘.
          </small>
          {candidates.length === 0 && (
            <small>일치하는 상품이 없어. 짧은 키워드나 SKU로 검색해줘.</small>
          )}
          <div
            style={{
              display: "grid",
              gap: 6,
              maxHeight: 360,
              overflow: "auto",
            }}
          >
            {candidates.map((row) => (
              <button
                key={`${row.match_source || "inventory"}:${row.id}`}
                type="button"
                onClick={() => {
                  onSelect(row);
                  setOpen(false);
                }}
                style={{
                  ...smallButton,
                  textAlign: "left",
                  background: row.id === selected?.id && row.match_source === selected?.match_source ? "#ecfdf5" : "white",
                }}
              >
                <MatchRow row={row} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MatchRow({ row }: { row: InventoryMatch }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
      {row.image_url && (
        <img
          src={row.image_url}
          alt=""
          loading="lazy"
          style={{
            width: 52,
            height: 52,
            objectFit: "contain",
            borderRadius: 5,
            background: "white",
          }}
        />
      )}
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <strong style={{ fontSize: 13 }}>
          {row.item_name || "상품명 없음"}
        </strong>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
          {[
            row.match_source === "sale" ? `방송판매재고${row.view_status === "completed" ? " · 판매완료" : row.view_status === "hidden" ? " · 숨김" : ""}` : "소싱 인벤토리",
            row.series_name,
            row.item_type,
            row.option_text,
            row.option_seq != null ? `옵션 ${row.option_seq}` : null,
            row.component_count ? `${row.component_count}개입` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {row.internal_sku && (
          <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
            {row.internal_sku}
          </div>
        )}
      </div>
    </div>
  );
}
