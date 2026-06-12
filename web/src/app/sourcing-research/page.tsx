"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

type SourcingItem = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  product_url: string;
  product_name: string;
  source_site: string;
  series_name: string;
  item_type: string;
  yen_price: number;
  extra_cost_yen: number;
  box_item_count: number;
  exchange_multiplier: number;
  expected_unit_price_krw: number;
  memo: string;
  image_url: string;
};

const STATUS_OPTIONS = ["검토중", "보류", "구매예정", "구매완료", "패스"];
const TYPE_OPTIONS = ["", "아크릴", "지류", "뱃지", "피규어", "인형", "키링", "기타"];

const emptyDraft: Omit<SourcingItem, "id" | "created_at" | "updated_at"> = {
  status: "검토중",
  product_url: "",
  product_name: "",
  source_site: "",
  series_name: "",
  item_type: "",
  yen_price: 0,
  extra_cost_yen: 0,
  box_item_count: 1,
  exchange_multiplier: 15,
  expected_unit_price_krw: 0,
  memo: "",
  image_url: "",
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function calc(item: Pick<SourcingItem, "yen_price" | "extra_cost_yen" | "box_item_count" | "exchange_multiplier" | "expected_unit_price_krw">) {
  const yenTotal = num(item.yen_price) + num(item.extra_cost_yen);
  const boxCost = yenTotal * num(item.exchange_multiplier || 15);
  const count = safeCount(item.box_item_count);
  const unitCost = boxCost / count;
  const minimumUnitPrice = (boxCost + 10000) / count;
  const expectedUnitPrice = num(item.expected_unit_price_krw);
  const unitProfit = expectedUnitPrice ? expectedUnitPrice - unitCost : 0;
  const boxProfit = expectedUnitPrice ? expectedUnitPrice * count - boxCost : 0;

  return { yenTotal, boxCost, unitCost, minimumUnitPrice, unitProfit, boxProfit };
}

export default function SourcingResearchPage() {
  const [items, setItems] = useState<SourcingItem[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [statusFilter, setStatusFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/sourcing-research", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "목록 조회 실패");
        return;
      }

      setItems(json.items || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter !== "전체" && item.status !== statusFilter) return false;
      if (!q) return true;

      const text = [
        item.product_name,
        item.product_url,
        item.source_site,
        item.series_name,
        item.item_type,
        item.memo,
        item.status,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [items, statusFilter, keyword]);

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((prev) => ({
      ...prev,
      [field]: isNumberField(field) ? Number(value || 0) : value,
    }));
  }

  function updateItem(id: string, field: keyof SourcingItem, value: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, [field]: isNumberField(field) ? Number(value || 0) : value }
          : item
      )
    );
  }

  function isNumberField(field: string) {
    return [
      "yen_price",
      "extra_cost_yen",
      "box_item_count",
      "exchange_multiplier",
      "expected_unit_price_krw",
    ].includes(field);
  }

  async function createItem() {
    if (!draft.product_name.trim() && !draft.product_url.trim()) {
      alert("상품명이나 링크 중 하나는 입력해줘.");
      return;
    }

    const res = await fetch("/api/sourcing-research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "저장 실패");
      return;
    }

    setDraft(emptyDraft);
    setMessage("저장 완료");
    await load();
  }

  async function saveItem(item: SourcingItem) {
    setSavingId(item.id);

    const res = await fetch(`/api/sourcing-research/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    const json = await res.json();
    setSavingId(null);

    if (!res.ok) {
      alert(json.detail || json.error || "수정 실패");
      return;
    }

    setMessage("수정 완료");
    await load();
  }

  async function deleteItem(item: SourcingItem) {
    if (!confirm(`삭제할까?\n\n${item.product_name || item.product_url}`)) return;

    const res = await fetch(`/api/sourcing-research/${item.id}`, {
      method: "DELETE",
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "삭제 실패");
      return;
    }

    setMessage("삭제 완료");
    await load();
  }

  const draftCalc = calc(draft as SourcingItem);

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <div style={topRowStyle}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>사입 검토 / 단가 계산</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>
              살까 말까 고민하는 상품 링크와 단가를 저장하고, 박스/개당 이윤을 바로 계산합니다.
            </p>
          </div>

          <Link href="/" style={homeButtonStyle}>메인으로</Link>
        </div>

        {message ? (
          <p style={{ color: message.includes("완료") ? "#059669" : "#b91c1c" }}>{message}</p>
        ) : null}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>새 검토 추가</h2>

        <div style={formGridStyle}>
          <Field label="상품 링크">
            <input value={draft.product_url} onChange={(e) => updateDraft("product_url", e.target.value)} style={inputStyle} placeholder="https://..." />
          </Field>
          <Field label="상품명">
            <input value={draft.product_name} onChange={(e) => updateDraft("product_name", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="사이트">
            <input value={draft.source_site} onChange={(e) => updateDraft("source_site", e.target.value)} style={inputStyle} placeholder="스루가야 / 메루카리..." />
          </Field>
          <Field label="작품명">
            <input value={draft.series_name} onChange={(e) => updateDraft("series_name", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="타입">
            <select value={draft.item_type} onChange={(e) => updateDraft("item_type", e.target.value)} style={inputStyle}>
              {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option || "선택안함"}</option>)}
            </select>
          </Field>
          <Field label="상태">
            <select value={draft.status} onChange={(e) => updateDraft("status", e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="엔화원가">
            <input type="number" value={draft.yen_price} onChange={(e) => updateDraft("yen_price", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="기타비용(엔)">
            <input type="number" value={draft.extra_cost_yen} onChange={(e) => updateDraft("extra_cost_yen", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="박스당 아이템수량">
            <input type="number" value={draft.box_item_count} onChange={(e) => updateDraft("box_item_count", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="환산배율">
            <input type="number" value={draft.exchange_multiplier} onChange={(e) => updateDraft("exchange_multiplier", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="예상 개당 판매가">
            <input type="number" value={draft.expected_unit_price_krw} onChange={(e) => updateDraft("expected_unit_price_krw", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="이미지 URL">
            <input value={draft.image_url} onChange={(e) => updateDraft("image_url", e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label="메모">
          <textarea value={draft.memo} onChange={(e) => updateDraft("memo", e.target.value)} style={textareaStyle} />
        </Field>

        <div style={calcGridStyle}>
          <CalcCard label="박스원가" value={won(draftCalc.boxCost)} sub={`${yen(draftCalc.yenTotal)} × ${draft.exchange_multiplier}`} />
          <CalcCard label="개당원가" value={won(draftCalc.unitCost)} sub={`${draft.box_item_count || 1}개 기준`} />
          <CalcCard label="최소 개당 추천단가" value={won(draftCalc.minimumUnitPrice)} sub="박스당 최소 10,000원 이윤" />
          <CalcCard label="개당 이윤" value={draft.expected_unit_price_krw ? won(draftCalc.unitProfit) : "-"} sub="예상 판매가 기준" />
          <CalcCard label="박스 이윤" value={draft.expected_unit_price_krw ? won(draftCalc.boxProfit) : "-"} sub="예상 판매가 기준" />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={createItem} style={blackButtonStyle}>저장</button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={topRowStyle}>
          <h2 style={{ margin: 0 }}>검토 기록</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="검색" style={searchStyle} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={filterSelectStyle}>
              <option>전체</option>
              {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
            <button type="button" onClick={() => void load()} style={blackButtonStyle}>새로고침</button>
          </div>
        </div>

        {loading ? (
          <p>불러오는 중...</p>
        ) : filtered.length ? (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {filtered.map((item) => <SourcingCard key={item.id} item={item} updateItem={updateItem} saveItem={saveItem} deleteItem={deleteItem} savingId={savingId} />)}
          </div>
        ) : (
          <p style={{ color: "#6b7280" }}>검토 기록이 없습니다.</p>
        )}
      </section>
    </main>
  );
}

function SourcingCard({
  item,
  updateItem,
  saveItem,
  deleteItem,
  savingId,
}: {
  item: SourcingItem;
  updateItem: (id: string, field: keyof SourcingItem, value: string) => void;
  saveItem: (item: SourcingItem) => Promise<void>;
  deleteItem: (item: SourcingItem) => Promise<void>;
  savingId: string | null;
}) {
  const c = calc(item);

  return (
    <article style={itemCardStyle}>
      <div style={imageBoxStyle}>
        {item.image_url ? <img src={item.image_url} alt="" style={imageStyle} /> : <span style={{ color: "#9ca3af", fontWeight: 800 }}>IMG</span>}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={itemHeaderStyle}>
          <select value={item.status || "검토중"} onChange={(e) => updateItem(item.id, "status", e.target.value)} style={smallSelectStyle}>
            {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
          </select>
          <input value={item.product_name || ""} onChange={(e) => updateItem(item.id, "product_name", e.target.value)} style={titleInputStyle} placeholder="상품명" />
        </div>

        <div style={recordGridStyle}>
          <Field label="링크"><input value={item.product_url || ""} onChange={(e) => updateItem(item.id, "product_url", e.target.value)} style={inputStyle} /></Field>
          <Field label="사이트"><input value={item.source_site || ""} onChange={(e) => updateItem(item.id, "source_site", e.target.value)} style={inputStyle} /></Field>
          <Field label="작품명"><input value={item.series_name || ""} onChange={(e) => updateItem(item.id, "series_name", e.target.value)} style={inputStyle} /></Field>
          <Field label="타입">
            <select value={item.item_type || ""} onChange={(e) => updateItem(item.id, "item_type", e.target.value)} style={inputStyle}>
              {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option || "선택안함"}</option>)}
            </select>
          </Field>
          <Field label="엔화원가"><input type="number" value={item.yen_price || 0} onChange={(e) => updateItem(item.id, "yen_price", e.target.value)} style={inputStyle} /></Field>
          <Field label="기타비용(엔)"><input type="number" value={item.extra_cost_yen || 0} onChange={(e) => updateItem(item.id, "extra_cost_yen", e.target.value)} style={inputStyle} /></Field>
          <Field label="수량"><input type="number" value={item.box_item_count || 1} onChange={(e) => updateItem(item.id, "box_item_count", e.target.value)} style={inputStyle} /></Field>
          <Field label="예상 개당 판매가"><input type="number" value={item.expected_unit_price_krw || 0} onChange={(e) => updateItem(item.id, "expected_unit_price_krw", e.target.value)} style={inputStyle} /></Field>
        </div>

        <div style={miniCalcGridStyle}>
          <CalcCard label="박스원가" value={won(c.boxCost)} sub={`${yen(c.yenTotal)} × ${item.exchange_multiplier || 15}`} />
          <CalcCard label="개당원가" value={won(c.unitCost)} sub={`${item.box_item_count || 1}개 기준`} />
          <CalcCard label="최소 추천가" value={won(c.minimumUnitPrice)} sub="+박스 1만원" />
          <CalcCard label="개당 이윤" value={item.expected_unit_price_krw ? won(c.unitProfit) : "-"} sub="예상 판매가 기준" />
          <CalcCard label="박스 이윤" value={item.expected_unit_price_krw ? won(c.boxProfit) : "-"} sub="예상 판매가 기준" />
        </div>

        <Field label="메모"><textarea value={item.memo || ""} onChange={(e) => updateItem(item.id, "memo", e.target.value)} style={textareaStyle} /></Field>

        <div style={buttonRowStyle}>
          {item.product_url ? <a href={item.product_url} target="_blank" rel="noreferrer" style={linkButtonStyle}>링크 열기</a> : null}
          <button type="button" onClick={() => void saveItem(item)} style={blackButtonStyle} disabled={savingId === item.id}>{savingId === item.id ? "저장중" : "저장"}</button>
          <button type="button" onClick={() => void deleteItem(item)} style={redButtonStyle}>삭제</button>
        </div>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function CalcCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={calcCardStyle}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <strong style={{ fontSize: 20 }}>{value}</strong>
      {sub ? <div style={{ color: "#9ca3af", fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

const cardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, background: "#fff" };
const topRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" };
const homeButtonStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 12px", textDecoration: "none", color: "#111827", fontWeight: 800, background: "#fff" };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const recordGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 10 };
const fieldStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", minHeight: 38, background: "#fff" };
const textareaStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", minHeight: 70, marginTop: 10 };
const calcGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 };
const miniCalcGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 10, marginBottom: 10 };
const calcCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f9fafb" };
const blackButtonStyle: CSSProperties = { border: 0, borderRadius: 10, padding: "10px 14px", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer" };
const redButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#dc2626" };
const searchStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 12px", minWidth: 220 };
const filterSelectStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 12px", background: "#fff" };
const itemCardStyle: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#fff" };
const imageBoxStyle: CSSProperties = { width: 120, height: 120, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
const imageStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const itemHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 };
const smallSelectStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", background: "#fff", fontWeight: 800 };
const titleInputStyle: CSSProperties = { ...inputStyle, fontWeight: 900 };
const buttonRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 10 };
const linkButtonStyle: CSSProperties = { ...blackButtonStyle, background: "#2563eb", textDecoration: "none" };
