"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Category = { id: string; code: string; name: string };
type Quantity = {
  id: string;
  quantity: number;
  stock_location: { id: string; name: string } | { id: string; name: string }[] | null;
};
type Variant = {
  id: string;
  variant_name: string;
  variant_code: string;
  image_url: string | null;
  desired_price: number | null;
  stock_quantity: Quantity[] | null;
};
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

type EditableVariant = {
  id: string;
  variant_name: string;
  variant_code: string;
  quantity: number;
};

type EditDraft = {
  product_id: string;
  title: string;
  category_code: string;
  group_name: string;
  collection_name: string;
  item_type: string;
  variants: EditableVariant[];
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function totalVariantQuantity(variant: Variant) {
  return (variant.stock_quantity || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

function unspecifiedQuantity(variant: Variant) {
  const row = (variant.stock_quantity || []).find(
    (item) => one(item.stock_location)?.name === "미지정"
  );
  return Number(row?.quantity || 0);
}

function totalQuantity(product: Product) {
  return (product.stock_variant || []).reduce(
    (sum, variant) => sum + totalVariantQuantity(variant),
    0
  );
}

function locationSummary(product: Product) {
  const map = new Map<string, number>();
  for (const variant of product.stock_variant || []) {
    for (const quantity of variant.stock_quantity || []) {
      const location = one(quantity.stock_location)?.name || "미지정";
      map.set(location, (map.get(location) || 0) + Number(quantity.quantity || 0));
    }
  }
  return (
    Array.from(map.entries())
      .map(([name, quantity]) => `${name} ${quantity}`)
      .join(" / ") || "재고 없음"
  );
}

function makeEditDraft(product: Product): EditDraft {
  return {
    product_id: product.id,
    title: product.title || "",
    category_code: one(product.stock_category)?.code || "",
    group_name: product.folder_name || "",
    collection_name: product.collection_name || "",
    item_type: product.item_type || "",
    variants: (product.stock_variant || []).map((variant) => ({
      id: variant.id,
      variant_name: variant.variant_name || "",
      variant_code: variant.variant_code || "",
      quantity: unspecifiedQuantity(variant),
    })),
  };
}

export default function StockPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();

    return products.filter((product) => {
      const category = one(product.stock_category)?.code || "";
      if (activeCategory && category !== activeCategory) return false;
      if (!keyword) return true;

      return [
        product.sku,
        product.title,
        product.collection_name,
        product.folder_name,
        product.release_name,
        product.item_type,
        ...(product.stock_variant || []).flatMap((variant) => [
          variant.variant_name,
          variant.variant_code,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [products, q, activeCategory]);

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditDraft(makeEditDraft(product));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function updateVariant(index: number, patch: Partial<EditableVariant>) {
    setEditDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        variants: current.variants.map((variant, variantIndex) =>
          variantIndex === index ? { ...variant, ...patch } : variant
        ),
      };
    });
  }

  function adjustQuantity(index: number, amount: number) {
    if (!editDraft) return;
    const current = editDraft.variants[index]?.quantity || 0;
    updateVariant(index, { quantity: Math.max(0, current + amount) });
  }

  async function saveEdit() {
    if (!editDraft) return;
    if (!editDraft.title.trim()) {
      alert("상품명을 입력해줘.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/stock/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || json.error || "수정 실패");
      }

      setMessage("수정 완료");
      cancelEdit();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 16 }}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>STOCK</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            등록된 재고를 조회하고 상품·옵션 정보를 수정합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={outlineButton}>
            홈으로
          </Link>
          <Link href="/stock/import" style={primaryButton}>
            사진 Import
          </Link>
        </div>
      </div>

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={tabStyle(activeCategory === "")}
            onClick={() => setActiveCategory("")}
          >
            전체
          </button>

          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              style={tabStyle(activeCategory === category.code)}
              onClick={() => setActiveCategory(category.code)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="SKU, 제목, 그룹, 활동기, 멤버/캐릭터 검색"
          style={searchStyle}
        />
      </section>

      {message ? (
        <p style={{ color: message === "수정 완료" ? "#047857" : "#b91c1c", fontWeight: 800 }}>
          {message}
        </p>
      ) : null}

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <section style={gridStyle}>
          {filtered.map((product) => {
            const category = one(product.stock_category);
            const batch = one(product.stock_batch);
            const editing = editingId === product.id && editDraft;

            return (
              <article key={product.id} style={productCardStyle}>
                <div style={imageBoxStyle}>
                  {product.primary_image_url ? (
                    <img
                      src={product.primary_image_url}
                      alt={product.title}
                      style={imageStyle}
                    />
                  ) : (
                    <span style={{ color: "#9ca3af" }}>NO IMAGE</span>
                  )}
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{product.sku}</strong>
                    <span style={badgeStyle}>{category?.name || "미분류"}</span>
                  </div>

                  {editing ? (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      <label style={labelStyle}>
                        상품명
                        <input
                          value={editDraft.title}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, title: event.target.value })
                          }
                          style={inputStyle}
                        />
                      </label>

                      <div style={twoColumnStyle}>
                        <label style={labelStyle}>
                          카테고리
                          <select
                            value={editDraft.category_code}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, category_code: event.target.value })
                            }
                            style={inputStyle}
                          >
                            <option value="">미분류</option>
                            {categories.map((item) => (
                              <option key={item.id} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={labelStyle}>
                          굿즈 종류
                          <input
                            value={editDraft.item_type}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, item_type: event.target.value })
                            }
                            style={inputStyle}
                          />
                        </label>
                      </div>

                      <div style={twoColumnStyle}>
                        <label style={labelStyle}>
                          그룹/작품
                          <input
                            value={editDraft.group_name}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, group_name: event.target.value })
                            }
                            style={inputStyle}
                          />
                        </label>

                        <label style={labelStyle}>
                          컬렉션/활동기
                          <input
                            value={editDraft.collection_name}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, collection_name: event.target.value })
                            }
                            style={inputStyle}
                          />
                        </label>
                      </div>

                      <div>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>하위 옵션</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {editDraft.variants.map((variant, index) => (
                            <div key={variant.id} style={editVariantRowStyle}>
                              <input
                                value={variant.variant_name}
                                onChange={(event) =>
                                  updateVariant(index, { variant_name: event.target.value })
                                }
                                placeholder="옵션 이름"
                                style={{ ...inputStyle, minWidth: 0 }}
                              />

                              <input
                                value={variant.variant_code}
                                onChange={(event) =>
                                  updateVariant(index, {
                                    variant_code: event.target.value.toUpperCase(),
                                  })
                                }
                                placeholder="코드"
                                style={{ ...inputStyle, width: 72, minWidth: 0 }}
                              />

                              <div style={quantityControlStyle}>
                                <button
                                  type="button"
                                  onClick={() => adjustQuantity(index, -1)}
                                  style={quantityButtonStyle}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  value={variant.quantity}
                                  onChange={(event) =>
                                    updateVariant(index, {
                                      quantity: Math.max(0, Number(event.target.value || 0)),
                                    })
                                  }
                                  style={quantityInputStyle}
                                />
                                <button
                                  type="button"
                                  onClick={() => adjustQuantity(index, 1)}
                                  style={quantityButtonStyle}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button type="button" onClick={cancelEdit} style={outlineActionButton}>
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={saving}
                          style={saveButton}
                        >
                          {saving ? "저장 중" : "수정 저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ margin: "10px 0 6px" }}>{product.title}</h3>
                      <p style={mutedStyle}>
                        {[product.folder_name, product.collection_name, product.item_type]
                          .filter(Boolean)
                          .join(" · ") || "-"}
                      </p>
                      <p style={{ margin: "10px 0 4px", fontWeight: 900 }}>
                        총 {totalQuantity(product)}개 · 하위 {(product.stock_variant || []).length}개
                      </p>
                      <p style={mutedStyle}>{locationSummary(product)}</p>
                      {batch ? <p style={mutedStyle}>배치: {batch.name}</p> : null}

                      <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                          하위항목 보기
                        </summary>
                        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                          {(product.stock_variant || []).map((variant) => (
                            <div key={variant.id} style={variantRowStyle}>
                              <span>
                                {product.sku}-{variant.variant_code} · {variant.variant_name}
                              </span>
                              <strong>{totalVariantQuantity(variant)}개</strong>
                            </div>
                          ))}
                        </div>
                      </details>

                      <button
                        type="button"
                        onClick={() => startEdit(product)}
                        style={editButton}
                      >
                        정보 수정
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}

          {!filtered.length ? (
            <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>등록된 재고가 없어.</div>
          ) : null}
        </section>
      )}
    </main>
  );
}

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 16,
};
const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
  gap: 14,
};
const productCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  overflow: "hidden",
};
const imageBoxStyle: CSSProperties = {
  height: 230,
  background: "#f3f4f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const imageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};
const outlineButton: CSSProperties = {
  textDecoration: "none",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 800,
};
const primaryButton: CSSProperties = {
  ...outlineButton,
  color: "#fff",
  background: "#111827",
  borderColor: "#111827",
};
const searchStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 14,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "11px 12px",
};
const mutedStyle: CSSProperties = {
  margin: "4px 0",
  color: "#6b7280",
  fontSize: 13,
};
const badgeStyle: CSSProperties = {
  background: "#f3f4f6",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 800,
};
const variantRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  padding: "7px 8px",
  background: "#f9fafb",
  borderRadius: 8,
  fontSize: 13,
};
const labelStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 800,
};
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 9,
  padding: "9px 10px",
  background: "#fff",
};
const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};
const editVariantRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(90px, 1fr) 72px auto",
  gap: 6,
  alignItems: "center",
};
const quantityControlStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px 48px 38px",
  gap: 4,
  alignItems: "center",
};
const quantityButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  border: "1px solid #d1d5db",
  borderRadius: 9,
  background: "#fff",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
};
const quantityInputStyle: CSSProperties = {
  width: 48,
  height: 38,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 9,
  textAlign: "center",
  fontWeight: 900,
};
const editButton: CSSProperties = {
  width: "100%",
  marginTop: 12,
  border: "1px solid #111827",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};
const outlineActionButton: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 13px",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
const saveButton: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #111827" : "1px solid #d1d5db",
    borderRadius: 999,
    padding: "9px 13px",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#111827",
    fontWeight: 800,
    cursor: "pointer",
  };
}
