"use client";

import { useMemo, useState, type CSSProperties } from "react";

type Candidate = { id: string; target_type: "group" | "lot"; name: string; image?: string; series?: string; item_type?: string; member_ids: string[]; remaining: number; search: string };
type Item = { id: string; product_name?: string; display_name_ko?: string; series_name?: string; matched_series_name?: string; item_type?: string; matched_item_type?: string; option_text?: string };
const button: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 9px", background: "#fff", color: "#334155", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const normalize = (v: unknown) => String(v || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export default function PurchaseStockMatchPicker({ item, groupName, onChanged }: { item: Item; groupName?: string; onChanged: (action: "link" | "unlink") => void }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(""), [notice, setNotice] = useState(""), [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const current = candidates.find(c => c.target_type === "group" && c.member_ids.includes(item.id));
  const filtered = useMemo(() => {
    const search = query.trim().split(/\s+/).map(normalize).filter(Boolean);
    const name = normalize(item.display_name_ko || item.product_name), words = String(item.display_name_ko || item.product_name || "").split(/\s+/).map(normalize).filter(w => w.length >= 2);
    const series = normalize(item.matched_series_name || item.series_name), type = normalize(item.matched_item_type || item.item_type);
    return candidates.filter(c => !c.member_ids.includes(item.id) && search.every(w => normalize([c.name, c.search, c.series, c.item_type].join(" ")).includes(w)))
      .map(c => { const n = normalize(c.name), hay = normalize(c.name + " " + c.search); return { c, score: (series && normalize(c.series) === series ? 100 : 0) + (type && normalize(c.item_type) === type ? 25 : 0) + (name && n === name ? 80 : name && (n.includes(name) || name.includes(n)) ? 40 : 0) + words.filter(w => hay.includes(w)).length * 8 }; })
      .sort((a, b) => b.score - a.score || b.c.remaining - a.c.remaining || a.c.name.localeCompare(b.c.name, "ko")).slice(0, 100).map(x => x.c);
  }, [candidates, query, item]);

  async function show() {
    setOpen(true); setQuery(""); setChosen(null); setNotice(""); setLoading(true);
    try { const res = await fetch("/api/purchases/stock-match", { cache: "no-store" }), json = await res.json(); if (!res.ok || !json.ok) throw new Error(json.message || "재고 조회 실패"); setCandidates(json.candidates || []); }
    catch (e) { setNotice(e instanceof Error ? e.message : "재고 조회 실패"); }
    finally { setLoading(false); }
  }
  async function save(action: "link" | "unlink") {
    if (action === "link" && !chosen) return;
    if (action === "unlink" && !confirm("이 매입차수의 묶음 연결만 해제할까? 기존 판매기록과 재고 수량은 그대로 유지돼.")) return;
    setSaving(true); setNotice("");
    try {
      const res = await fetch("/api/purchases/stock-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchase_item_id: item.id, action, target_type: chosen?.target_type, target_id: chosen?.id }) }), json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "재고 연결 실패");
      onChanged(action); setOpen(false);
    } catch (e) { setNotice(e instanceof Error ? e.message : "재고 연결 실패"); }
    finally { setSaving(false); }
  }
  return <>
    <button style={{ ...button, color: groupName ? "#047857" : "#1d4ed8", textAlign: "left" }} type="button" onClick={() => void show()}>{groupName ? `재고 묶음 · ${groupName}` : "기존 재고 검색 · 연결"}</button>
    {open && <div role="dialog" aria-modal="true" aria-label="기존 재고 연결" style={{ position: "fixed", inset: 0, zIndex: 100, background: "#11182780", display: "grid", placeItems: "center", padding: 16 }} onClick={() => !saving && setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", borderRadius: 12, background: "white", padding: 18, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>기존 방송판매재고 연결</strong><button style={button} disabled={saving} onClick={() => setOpen(false)}>닫기</button></div>
        <div style={{ fontSize: 13, color: "#475569" }}>{item.display_name_ko || item.product_name} · {item.option_text || ""}</div>
        <div style={{ fontSize: 12, padding: 9, borderRadius: 6, background: "#eff6ff", color: "#1e40af" }}>매입 단가·결제금액·수량과 기존 판매기록은 변경하지 않아. 미입고 상품은 입고완료 후에만 묶음 재고에 합산돼.</div>
        {notice && <div role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{notice}</div>}
        {loading ? <div>기존 재고 불러오는 중...</div> : current || groupName ? <div style={{ display: "grid", gap: 8 }}><b>현재 연결: {current?.name || groupName}</b><button style={{ ...button, color: "#b91c1c" }} disabled={saving} onClick={() => void save("unlink")}>이 매입차수 연결만 해제</button></div> : <>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="상품명, 작품, 상품종류, 관리코드 검색" style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 7 }} />
          <small style={{ color: "#64748b" }}>{query ? "검색 결과" : "상품명·작품 기반 추천"} · 판매완료 상품도 연결 가능</small>
          <div style={{ display: "grid", gap: 5, maxHeight: 400, overflow: "auto" }}>{filtered.map(c => <button key={`${c.target_type}:${c.id}`} type="button" onClick={() => setChosen(c)} style={{ ...button, textAlign: "left", display: "flex", gap: 10, alignItems: "center", background: chosen?.id === c.id ? "#dbeafe" : "white", borderColor: chosen?.id === c.id ? "#2563eb" : "#cbd5e1" }}>
            {c.image && <img src={c.image} alt="" loading="lazy" style={{ width: 46, height: 46, objectFit: "contain" }} />}
            <div style={{ flex: 1 }}><b style={{ fontSize: 13 }}>{c.name}</b><div style={{ color: "#64748b", marginTop: 3 }}>{[c.target_type === "group" ? `묶음 ${c.member_ids.length}차수` : "개별 재고", c.series, c.item_type, `잔여 ${c.remaining}개`].filter(Boolean).join(" · ")}</div></div>
          </button>)}{!filtered.length && <small>검색 결과가 없어. 다른 키워드를 입력해줘.</small>}</div>
          <button type="button" style={{ ...button, background: chosen ? "#1d4ed8" : "#94a3b8", color: "#fff", fontSize: 13, padding: 10 }} disabled={!chosen || saving} onClick={() => void save("link")}>{saving ? "연결 중..." : chosen ? `${chosen.name} 연결` : "연결할 기존 재고 선택"}</button>
        </>}
      </div>
    </div>}
  </>;
}
