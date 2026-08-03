"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type MetaItem = { id: string; name: string; code?: string };
type Dictionary = { display_name: string; alias: string; code: string; dictionary_type: string };
type VariantDraft = { variant_name: string; variant_code: string; quantity: string; location_id: string; image_url: string; desired_price: string };

const SKZ_DEFAULTS = [
  ["방찬", "CHAN"], ["리노", "KNOW"], ["창빈", "CBIN"], ["현진", "HJIN"],
  ["한", "HAN"], ["필릭스", "FLIX"], ["승민", "SMIN"], ["아이엔", "IN"],
];

export default function NewStockPage() {
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [batches, setBatches] = useState<MetaItem[]>([]);
  const [dictionary, setDictionary] = useState<Dictionary[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category_id: "", batch_id: "", title: "", collection_name: "", folder_name: "", release_name: "", item_type: "", release_price: "", desired_price: "", currency: "KRW", primary_image_url: "", memo: "" });
  const [variants, setVariants] = useState<VariantDraft[]>([{ variant_name: "기본", variant_code: "BASE", quantity: "1", location_id: "", image_url: "", desired_price: "" }]);

  useEffect(() => {
    fetch("/api/stock/meta", { cache: "no-store" }).then((r) => r.json()).then((json) => {
      setCategories(json.categories || []); setLocations(json.locations || []); setBatches(json.batches || []); setDictionary(json.dictionary || []);
      const defaultLocation = (json.locations || [])[0]?.id || "";
      setVariants((prev) => prev.map((v) => ({ ...v, location_id: v.location_id || defaultLocation })));
    });
  }, []);

  const selectedCategory = useMemo(() => categories.find((c) => c.id === form.category_id), [categories, form.category_id]);

  function addVariant(name = "", code = "") {
    setVariants((prev) => [...prev, { variant_name: name, variant_code: code, quantity: "1", location_id: locations[0]?.id || "", image_url: "", desired_price: "" }]);
  }

  function loadSkzMembers() {
    setVariants(SKZ_DEFAULTS.map(([variant_name, variant_code]) => ({ variant_name, variant_code, quantity: "1", location_id: locations[0]?.id || "", image_url: "", desired_price: "" })));
    setForm((prev) => ({ ...prev, collection_name: prev.collection_name || "Stray Kids" }));
  }

  function suggestCode(name: string) {
    const normalized = name.trim().toLowerCase();
    const found = dictionary.find((item) => item.alias.trim().toLowerCase() === normalized || item.display_name.trim().toLowerCase() === normalized);
    if (found) return found.code;
    return name.replace(/[^a-zA-Z0-9가-힣]/g, "").slice(0, 4).toUpperCase();
  }

  async function save() {
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/stock/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, variants }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || "저장 실패");
      setMessage(`저장 완료: ${json.sku}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 실패"); }
    finally { setSaving(false); }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={headerStyle}>
        <div><h1 style={{ margin: 0 }}>STOCK 신규 등록</h1><p style={mutedStyle}>상위 SKU는 저장 시 자동 생성되고, 하위 SKU는 상위 SKU + 코드로 표시됩니다.</p></div>
        <div style={{ display: "flex", gap: 8 }}><Link href="/stock" style={outlineButton}>목록으로</Link><Link href="/" style={outlineButton}>홈으로</Link></div>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>상위 상품</h2>
        <div style={formGridStyle}>
          <Field label="카테고리"><select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={inputStyle}><option value="">선택</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="배치"><select value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })} style={inputStyle}><option value="">없음</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="상품명 *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} /></Field>
          <Field label="그룹/작품"><input value={form.collection_name} onChange={(e) => setForm({ ...form, collection_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="폴더"><input value={form.folder_name} onChange={(e) => setForm({ ...form, folder_name: e.target.value })} placeholder="MAXIDENT, Jump Shop 등" style={inputStyle} /></Field>
          <Field label="활동기/앨범명"><input value={form.release_name} onChange={(e) => setForm({ ...form, release_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="굿즈 종류"><input value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })} placeholder="포토카드, 피규어, 캔뱃지" style={inputStyle} /></Field>
          <Field label="대표사진 URL"><input value={form.primary_image_url} onChange={(e) => setForm({ ...form, primary_image_url: e.target.value })} style={inputStyle} /></Field>
          <Field label="발매가"><input type="number" value={form.release_price} onChange={(e) => setForm({ ...form, release_price: e.target.value })} style={inputStyle} /></Field>
          <Field label="희망판매가"><input type="number" value={form.desired_price} onChange={(e) => setForm({ ...form, desired_price: e.target.value })} style={inputStyle} /></Field>
          <Field label="통화"><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={inputStyle}><option>KRW</option><option>JPY</option><option>USD</option></select></Field>
        </div>
        <Field label="메모"><textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle, minHeight: 80 }} /></Field>
      </section>

      <section style={cardStyle}>
        <div style={headerStyle}><div><h2 style={{ margin: 0 }}>하위항목</h2><p style={mutedStyle}>멤버, 캐릭터, 번호, 버전을 각각 등록합니다.</p></div><div style={{ display: "flex", gap: 8 }}>
          {selectedCategory?.code === "skz" ? <button type="button" onClick={loadSkzMembers} style={purpleButton}>SKZ 8명 불러오기</button> : null}
          <button type="button" onClick={() => addVariant()} style={outlineButton}>+ 하위항목</button>
        </div></div>
        <div style={{ display: "grid", gap: 10 }}>
          {variants.map((variant, index) => (
            <div key={index} style={variantCardStyle}>
              <Field label="이름"><input value={variant.variant_name} onChange={(e) => { const next = [...variants]; next[index] = { ...variant, variant_name: e.target.value, variant_code: variant.variant_code || suggestCode(e.target.value) }; setVariants(next); }} style={inputStyle} /></Field>
              <Field label="코드"><input value={variant.variant_code} onChange={(e) => { const next = [...variants]; next[index] = { ...variant, variant_code: e.target.value.toUpperCase() }; setVariants(next); }} style={inputStyle} /></Field>
              <Field label="수량"><input type="number" min="0" value={variant.quantity} onChange={(e) => { const next = [...variants]; next[index] = { ...variant, quantity: e.target.value }; setVariants(next); }} style={inputStyle} /></Field>
              <Field label="위치"><select value={variant.location_id} onChange={(e) => { const next = [...variants]; next[index] = { ...variant, location_id: e.target.value }; setVariants(next); }} style={inputStyle}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <Field label="개별사진 URL"><input value={variant.image_url} onChange={(e) => { const next = [...variants]; next[index] = { ...variant, image_url: e.target.value }; setVariants(next); }} style={inputStyle} /></Field>
              <button type="button" onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))} style={redButton}>삭제</button>
            </div>
          ))}
        </div>
      </section>

      {message ? <p style={{ color: message.includes("완료") ? "#047857" : "#b91c1c", fontWeight: 900 }}>{message}</p> : null}
      <button type="button" disabled={saving} onClick={() => void save()} style={saveButton}>{saving ? "저장 중..." : "STOCK 저장"}</button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>{label}{children}</label>; }
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 };
const cardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, background: "#fff", marginBottom: 16 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 9, padding: "9px 10px", background: "#fff" };
const variantCardStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 1fr 1.5fr auto", gap: 8, alignItems: "end", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 };
const outlineButton: CSSProperties = { textDecoration: "none", border: "1px solid #d1d5db", borderRadius: 9, padding: "9px 12px", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" };
const purpleButton: CSSProperties = { ...outlineButton, background: "#7c3aed", borderColor: "#7c3aed", color: "#fff" };
const redButton: CSSProperties = { ...outlineButton, background: "#dc2626", borderColor: "#dc2626", color: "#fff" };
const saveButton: CSSProperties = { width: "100%", border: 0, borderRadius: 12, padding: 14, background: "#111827", color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer" };
const mutedStyle: CSSProperties = { margin: "6px 0 0", color: "#6b7280", fontSize: 13 };
