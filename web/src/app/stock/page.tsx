"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Category = { id: string; code: string; name: string };
type Quantity = { id: string; quantity: number; stock_location: { id: string; name: string } | { id: string; name: string }[] | null };
type Variant = { id: string; variant_name: string; variant_code: string; image_url: string | null; desired_price: number | null; stock_quantity: Quantity[] | null };
type Product = {
  id: string;
  sku: string;
  title: string;
  collection_name: string | null;
  folder_name: string | null;
  release_name: string | null;
  item_type: string | null;
  release_price: number | null;
  desired_price: number | null;
  currency: string;
  primary_image_url: string | null;
  status: string;
  stock_category: Category | Category[] | null;
  stock_batch: { id: string; name: string } | { id: string; name: string }[] | null;
  stock_variant: Variant[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function totalQuantity(product: Product) {
  return (product.stock_variant || []).reduce(
    (sum, variant) => sum + (variant.stock_quantity || []).reduce((inner, q) => inner + Number(q.quantity || 0), 0),
    0
  );
}

function locationSummary(product: Product) {
  const map = new Map<string, number>();
  for (const variant of product.stock_variant || []) {
    for (const q of variant.stock_quantity || []) {
      const location = one(q.stock_location)?.name || "미지정";
      map.set(location, (map.get(location) || 0) + Number(q.quantity || 0));
    }
  }
  return Array.from(map.entries()).map(([name, quantity]) => `${name} ${quantity}`).join(" / ") || "재고 없음";
}

export default function StockPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [metaRes, productRes] = await Promise.all([
        fetch("/api/stock/meta", { cache: "no-store" }),
        fetch("/api/stock/products", { cache: "no-store" }),
      ]);
      const meta = await metaRes.json();
      const product = await productRes.json();
      if (!metaRes.ok) throw new Error(meta.detail || meta.error || "설정 조회 실패");
      if (!productRes.ok) throw new Error(product.detail || product.error || "재고 조회 실패");
      setCategories(meta.categories || []);
      setProducts(product.products || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return products.filter((product) => {
      const category = one(product.stock_category)?.code || "";
      if (activeCategory && category !== activeCategory) return false;
      if (!keyword) return true;
      return [product.sku, product.title, product.collection_name, product.folder_name, product.release_name, product.item_type, ...(product.stock_variant || []).flatMap((v) => [v.variant_name, v.variant_code])]
        .join(" ").toLowerCase().includes(keyword);
    });
  }, [products, q, activeCategory]);

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 24 }}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>STOCK</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>사진, 하위항목, 위치별 수량과 가격을 관리합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={outlineButton}>홈으로</Link>
          <Link href="/stock/import" style={primaryButton}>사진 Import</Link>
        </div>
      </div>

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={tabStyle(activeCategory === "")} onClick={() => setActiveCategory("")}>전체</button>
          {categories.map((category) => (
            <button key={category.id} type="button" style={tabStyle(activeCategory === category.code)} onClick={() => setActiveCategory(category.code)}>{category.name}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, 제목, 그룹, 활동기, 멤버/캐릭터 검색" style={searchStyle} />
      </section>

      {message ? <p style={{ color: "#b91c1c", fontWeight: 800 }}>{message}</p> : null}
      {loading ? <p>불러오는 중...</p> : (
        <section style={gridStyle}>
          {filtered.map((product) => {
            const category = one(product.stock_category);
            const batch = one(product.stock_batch);
            return (
              <article key={product.id} style={productCardStyle}>
                <div style={imageBoxStyle}>
                  {product.primary_image_url ? <img src={product.primary_image_url} alt={product.title} style={imageStyle} /> : <span style={{ color: "#9ca3af" }}>NO IMAGE</span>}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{product.sku}</strong>
                    <span style={badgeStyle}>{category?.name || "미분류"}</span>
                  </div>
                  <h3 style={{ margin: "10px 0 6px" }}>{product.title}</h3>
                  <p style={mutedStyle}>{[product.collection_name, product.release_name, product.item_type].filter(Boolean).join(" · ") || "-"}</p>
                  <p style={{ margin: "10px 0 4px", fontWeight: 900 }}>총 {totalQuantity(product)}개 · 하위 {(product.stock_variant || []).length}개</p>
                  <p style={mutedStyle}>{locationSummary(product)}</p>
                  <p style={mutedStyle}>희망가 {product.desired_price ? `${Number(product.desired_price).toLocaleString()}원` : "-"} / 발매가 {product.release_price ? `${Number(product.release_price).toLocaleString()} ${product.currency}` : "-"}</p>
                  {batch ? <p style={mutedStyle}>배치: {batch.name}</p> : null}
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>하위항목 보기</summary>
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {(product.stock_variant || []).map((variant) => (
                        <div key={variant.id} style={variantRowStyle}>
                          <span>{product.sku}-{variant.variant_code} · {variant.variant_name}</span>
                          <strong>{(variant.stock_quantity || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}개</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
          {!filtered.length ? <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>등록된 재고가 없어.</div> : null}
        </section>
      )}
    </main>
  );
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 };
const cardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff", marginBottom: 16 };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 };
const productCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", overflow: "hidden" };
const imageBoxStyle: CSSProperties = { height: 230, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" };
const imageStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const outlineButton: CSSProperties = { textDecoration: "none", color: "#111827", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 14px", fontWeight: 800 };
const primaryButton: CSSProperties = { ...outlineButton, color: "#fff", background: "#111827", borderColor: "#111827" };
const searchStyle: CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 14, border: "1px solid #d1d5db", borderRadius: 10, padding: "11px 12px" };
const mutedStyle: CSSProperties = { margin: "4px 0", color: "#6b7280", fontSize: 13 };
const badgeStyle: CSSProperties = { background: "#f3f4f6", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 800 };
const variantRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 8px", background: "#f9fafb", borderRadius: 8, fontSize: 13 };
function tabStyle(active: boolean): CSSProperties { return { border: active ? "1px solid #111827" : "1px solid #d1d5db", borderRadius: 999, padding: "9px 13px", background: active ? "#111827" : "#fff", color: active ? "#fff" : "#111827", fontWeight: 800, cursor: "pointer" }; }
