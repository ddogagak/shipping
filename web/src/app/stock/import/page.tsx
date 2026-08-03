"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";

type PreviewImage = {
  id: string;
  file: File;
  previewUrl: string;
  selected: boolean;
};

type ProductMode = "single" | "variants";

type VariantDraft = {
  id: string;
  name: string;
  code: string;
  quantity: number;
};

type ProductDraft = {
  title: string;
  category: string;
  collection: string;
  groupName: string;
  itemType: string;
  memo: string;
  mode: ProductMode;
  coverImageId: string;
  variants: VariantDraft[];
};

const SKZ_VARIANTS = [
  ["방찬", "CHAN"],
  ["리노", "KNOW"],
  ["창빈", "CBIN"],
  ["현진", "HJIN"],
  ["한", "HAN"],
  ["필릭스", "FLIX"],
  ["승민", "SMIN"],
  ["아이엔", "IN"],
] as const;

function makeImageId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function StockImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imagesRef = useRef<PreviewImage[]>([]);

  const [images, setImages] = useState<PreviewImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftImageIds, setDraftImageIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ProductDraft>({
    title: "",
    category: "SKZ",
    collection: "",
    groupName: "Stray Kids",
    itemType: "",
    memo: "",
    mode: "single",
    coverImageId: "",
    variants: [],
  });

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  const selectedImages = useMemo(
    () => images.filter((image) => image.selected),
    [images]
  );

  function addFiles(fileList: FileList | File[]) {
    const allFiles = Array.from(fileList);
    const imageFiles = allFiles.filter(isImageFile);

    if (!imageFiles.length) {
      setMessage("이미지 파일을 선택해줘.");
      return;
    }

    const next = imageFiles.map((file, index) => ({
      id: makeImageId(file, index),
      file,
      previewUrl: URL.createObjectURL(file),
      selected: true,
    }));

    setImages((prev) => [...prev, ...next]);

    const skipped = allFiles.length - imageFiles.length;
    setMessage(
      skipped > 0
        ? `이미지 ${imageFiles.length}장 추가 / 이미지가 아닌 파일 ${skipped}개 제외`
        : `이미지 ${imageFiles.length}장 추가`
    );
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  function toggleImage(id: string) {
    setImages((prev) =>
      prev.map((image) =>
        image.id === id ? { ...image, selected: !image.selected } : image
      )
    );
  }

  function selectAll(selected: boolean) {
    setImages((prev) => prev.map((image) => ({ ...image, selected })));
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }

  function removeSelected() {
    if (!selectedImages.length) {
      setMessage("삭제할 사진을 선택해줘.");
      return;
    }

    const selectedIds = new Set(selectedImages.map((image) => image.id));

    setImages((prev) => {
      prev.forEach((image) => {
        if (selectedIds.has(image.id)) URL.revokeObjectURL(image.previewUrl);
      });
      return prev.filter((image) => !selectedIds.has(image.id));
    });

    setMessage(`선택한 사진 ${selectedImages.length}장 제거`);
  }

  function clearAll() {
    if (!images.length) return;
    if (!confirm(`사진 ${images.length}장을 전부 비울까?`)) return;

    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setMessage("사진을 모두 비웠어.");
  }

  function createProductDraft() {
    if (!selectedImages.length) {
      alert("상품으로 묶을 사진을 선택해줘.");
      return;
    }

    const ids = selectedImages.map((image) => image.id);
    setDraftImageIds(ids);
    setDraft((prev) => ({
      ...prev,
      coverImageId: ids[0] || "",
      variants: [],
    }));
    setDraftOpen(true);
    setMessage(`선택한 사진 ${ids.length}장으로 상품 초안을 만들고 있어.`);

    requestAnimationFrame(() => {
      document.getElementById("stock-product-draft")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function updateDraft(patch: Partial<ProductDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function addVariant() {
    setDraft((prev) => ({
      ...prev,
      mode: "variants",
      variants: [
        ...prev.variants,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: "",
          code: "",
          quantity: 1,
        },
      ],
    }));
  }

  function loadSkzVariants() {
    setDraft((prev) => ({
      ...prev,
      mode: "variants",
      category: "SKZ",
      groupName: "Stray Kids",
      variants: SKZ_VARIANTS.map(([name, code], index) => ({
        id: `${code}-${Date.now()}-${index}`,
        name,
        code,
        quantity: 1,
      })),
    }));
  }

  function updateVariant(id: string, patch: Partial<VariantDraft>) {
    setDraft((prev) => ({
      ...prev,
      variants: prev.variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant
      ),
    }));
  }

  function removeVariant(id: string) {
    setDraft((prev) => ({
      ...prev,
      variants: prev.variants.filter((variant) => variant.id !== id),
    }));
  }

  function validateDraft() {
    if (!draft.title.trim()) {
      alert("상품명을 입력해줘.");
      return;
    }

    if (!draft.coverImageId) {
      alert("대표사진을 선택해줘.");
      return;
    }

    if (draft.mode === "variants") {
      if (!draft.variants.length) {
        alert("하위 옵션을 하나 이상 추가해줘.");
        return;
      }

      const invalid = draft.variants.find(
        (variant) => !variant.name.trim() || !variant.code.trim()
      );
      if (invalid) {
        alert("하위 옵션의 이름과 코드를 모두 입력해줘.");
        return;
      }
    }

    setMessage(
      `상품 초안 확인 완료: ${draft.title} / ${
        draft.mode === "single" ? "단일 상품" : `하위 옵션 ${draft.variants.length}개`
      }. 다음 단계에서 Storage와 DB 저장을 연결하면 돼.`
    );
  }

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: 24 }}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>STOCK Import</h1>
          <p style={descriptionStyle}>
            사진을 한꺼번에 올리고, 같은 상품으로 묶을 사진을 선택합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/" style={outlineButtonStyle}>
            홈으로
          </Link>
          <Link href="/stock" style={outlineButtonStyle}>
            STOCK 목록
          </Link>
        </div>
      </header>

      <section style={cardStyle}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={onDrop}
          style={uploadBoxStyle(dragging)}
        >
          <div style={{ fontSize: 38, lineHeight: 1 }}>📷</div>
          <strong style={{ fontSize: 18 }}>사진을 드래그하거나 클릭해서 선택</strong>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            JPG, PNG, WEBP 등 이미지 여러 장을 한 번에 선택할 수 있어요.
          </span>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>

        {message ? <p style={messageStyle}>{message}</p> : null}
      </section>

      {images.length ? (
        <section style={cardStyle}>
          <div style={actionBarStyle}>
            <div>
              <strong style={{ fontSize: 17 }}>
                전체 {images.length}장 · 선택 {selectedImages.length}장
              </strong>
              <p style={{ margin: "5px 0 0", color: "#6b7280", fontSize: 13 }}>
                사진을 클릭하면 선택하거나 해제할 수 있어요.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => selectAll(true)} style={smallButtonStyle}>
                전체선택
              </button>
              <button type="button" onClick={() => selectAll(false)} style={smallButtonStyle}>
                전체해제
              </button>
              <button type="button" onClick={removeSelected} style={dangerButtonStyle}>
                선택삭제
              </button>
              <button type="button" onClick={clearAll} style={dangerOutlineButtonStyle}>
                전부비우기
              </button>
              <button type="button" onClick={createProductDraft} style={primaryButtonStyle}>
                선택 사진으로 상품 만들기
              </button>
            </div>
          </div>

          <div style={imageGridStyle}>
            {images.map((image, index) => (
              <article
                key={image.id}
                onClick={() => toggleImage(image.id)}
                style={imageCardStyle(image.selected)}
              >
                <div style={imageFrameStyle}>
                  <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    style={previewImageStyle}
                  />

                  <span style={numberBadgeStyle}>{index + 1}</span>

                  <span style={selectBadgeStyle(image.selected)}>
                    {image.selected ? "✓ 선택" : "선택 안 함"}
                  </span>

                  <button
                    type="button"
                    aria-label={`${image.file.name} 삭제`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImage(image.id);
                    }}
                    style={removeButtonStyle}
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: 10 }}>
                  <div title={image.file.name} style={fileNameStyle}>
                    {image.file.name}
                  </div>
                  <div style={fileMetaStyle}>
                    {(image.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section style={emptyStyle}>
          아직 선택한 사진이 없어. 위 영역에 사진을 올려줘.
        </section>
      )}

      {draftOpen ? (
        <section id="stock-product-draft" style={{ ...cardStyle, borderColor: "#111827" }}>
          <div style={draftHeaderStyle}>
            <div>
              <h2 style={{ margin: 0 }}>상품 초안 만들기</h2>
              <p style={descriptionStyle}>
                선택한 사진을 기준으로 상위 상품과 하위 옵션 구조만 먼저 만듭니다.
              </p>
            </div>
            <button type="button" onClick={() => setDraftOpen(false)} style={dangerOutlineButtonStyle}>
              초안 닫기
            </button>
          </div>

          <div style={draftGridStyle}>
            <div>
              <h3 style={{ marginTop: 0 }}>1. 대표사진 선택</h3>
              <div style={draftImageGridStyle}>
                {images
                  .filter((image) => draftImageIds.includes(image.id))
                  .map((image) => {
                    const isCover = draft.coverImageId === image.id;
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => updateDraft({ coverImageId: image.id })}
                        style={coverImageButtonStyle(isCover)}
                      >
                        <img src={image.previewUrl} alt={image.file.name} style={previewImageStyle} />
                        <span style={coverBadgeStyle(isCover)}>
                          {isCover ? "대표사진" : "대표로 지정"}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div>
              <h3 style={{ marginTop: 0 }}>2. 상품 정보</h3>
              <div style={formGridStyle}>
                <label style={labelStyle}>
                  상품명 *
                  <input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  카테고리
                  <select value={draft.category} onChange={(e) => updateDraft({ category: e.target.value })} style={inputStyle}>
                    <option value="SKZ">SKZ</option>
                    <option value="피규어">피규어</option>
                    <option value="가챠">가챠</option>
                    <option value="랜덤굿즈">랜덤굿즈</option>
                    <option value="기타">기타</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  그룹/작품
                  <input value={draft.groupName} onChange={(e) => updateDraft({ groupName: e.target.value })} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  컬렉션/활동기
                  <input value={draft.collection} onChange={(e) => updateDraft({ collection: e.target.value })} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  굿즈 종류
                  <input value={draft.itemType} onChange={(e) => updateDraft({ itemType: e.target.value })} style={inputStyle} placeholder="포토카드, 피규어, 캔뱃지" />
                </label>
              </div>
              <label style={{ ...labelStyle, marginTop: 12 }}>
                메모
                <textarea value={draft.memo} onChange={(e) => updateDraft({ memo: e.target.value })} style={textareaStyle} />
              </label>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <h3 style={{ marginBottom: 10 }}>3. 상품 구조</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => updateDraft({ mode: "single" })} style={modeButtonStyle(draft.mode === "single")}>
                단일 상품
              </button>
              <button type="button" onClick={() => updateDraft({ mode: "variants" })} style={modeButtonStyle(draft.mode === "variants")}>
                하위 옵션 있음
              </button>
            </div>
          </div>

          {draft.mode === "single" ? (
            <div style={draftNoticeStyle}>
              단일 상품 초안에는 상위 상품 정보만 저장합니다. 수량·위치·가격·추가사진은 상품 상세에서 입력합니다.
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={variantActionStyle}>
                <strong>하위 옵션 {draft.variants.length}개</strong>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={loadSkzVariants} style={smallButtonStyle}>SKZ 8명 불러오기</button>
                  <button type="button" onClick={addVariant} style={primaryButtonStyle}>+ 하위 옵션</button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {draft.variants.map((variant, index) => (
                  <div key={variant.id} style={variantRowStyle}>
                    <strong style={{ paddingTop: 10 }}>{index + 1}</strong>
                    <label style={labelStyle}>
                      이름
                      <input value={variant.name} onChange={(e) => updateVariant(variant.id, { name: e.target.value })} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      코드
                      <input value={variant.code} onChange={(e) => updateVariant(variant.id, { code: e.target.value.toUpperCase() })} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      수량
                      <input type="number" min={0} value={variant.quantity} onChange={(e) => updateVariant(variant.id, { quantity: Number(e.target.value || 0) })} style={inputStyle} />
                    </label>
                    <button type="button" onClick={() => removeVariant(variant.id)} style={dangerButtonStyle}>삭제</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" onClick={validateDraft} style={saveDraftButtonStyle}>
              상품 초안 확인
            </button>
          </div>
        </section>
      ) : null}
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

const descriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6b7280",
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  background: "#fff",
  marginBottom: 16,
};

const outlineButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  fontWeight: 800,
};

function uploadBoxStyle(active: boolean): CSSProperties {
  return {
    minHeight: 220,
    border: active ? "2px dashed #2563eb" : "2px dashed #cbd5e1",
    borderRadius: 16,
    background: active ? "#eff6ff" : "#f8fafc",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    textAlign: "center",
    cursor: "pointer",
    outline: "none",
  };
}

const messageStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#047857",
  fontWeight: 800,
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "9px 12px",
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  borderColor: "#111827",
  background: "#111827",
  color: "#fff",
};

const dangerButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  borderColor: "#dc2626",
  background: "#dc2626",
  color: "#fff",
};

const dangerOutlineButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  borderColor: "#fecaca",
  color: "#b91c1c",
};

const imageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 12,
};

function imageCardStyle(selected: boolean): CSSProperties {
  return {
    minWidth: 0,
    border: selected ? "3px solid #2563eb" : "1px solid #e5e7eb",
    borderRadius: 14,
    overflow: "hidden",
    background: "#fff",
    cursor: "pointer",
    boxShadow: selected ? "0 0 0 2px rgba(37, 99, 235, 0.12)" : "none",
  };
}

const imageFrameStyle: CSSProperties = {
  position: "relative",
  aspectRatio: "1 / 1",
  background: "#f3f4f6",
  overflow: "hidden",
};

const previewImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const numberBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  minWidth: 26,
  height: 26,
  padding: "0 7px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "rgba(17, 24, 39, 0.85)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
};

function selectBadgeStyle(selected: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    padding: "5px 8px",
    background: selected ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
    color: selected ? "#fff" : "#374151",
    fontSize: 12,
    fontWeight: 900,
  };
}

const removeButtonStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  border: 0,
  borderRadius: 999,
  background: "rgba(220, 38, 38, 0.9)",
  color: "#fff",
  fontSize: 21,
  lineHeight: 1,
  cursor: "pointer",
};

const fileNameStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  fontWeight: 800,
};

const fileMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#6b7280",
  fontSize: 12,
};

const emptyStyle: CSSProperties = {
  border: "1px dashed #d1d5db",
  borderRadius: 16,
  padding: 36,
  textAlign: "center",
  color: "#6b7280",
  background: "#fff",
};


const draftHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 18,
};

const draftGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(300px, 0.9fr) minmax(420px, 1.4fr)",
  gap: 22,
};

const draftImageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
};

function coverImageButtonStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    aspectRatio: "1 / 1",
    padding: 0,
    overflow: "hidden",
    borderRadius: 12,
    border: active ? "3px solid #111827" : "1px solid #d1d5db",
    background: "#f3f4f6",
    cursor: "pointer",
  };
}

function coverBadgeStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    padding: "5px 7px",
    borderRadius: 8,
    background: active ? "#111827" : "rgba(255,255,255,.9)",
    color: active ? "#fff" : "#111827",
    fontSize: 11,
    fontWeight: 900,
  };
}

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 78,
  resize: "vertical",
};

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    ...smallButtonStyle,
    borderColor: active ? "#111827" : "#d1d5db",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#111827",
  };
}

const variantActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
};

const variantRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px 1fr 110px minmax(190px, 1.3fr) 90px 130px 110px auto",
  gap: 8,
  alignItems: "end",
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#f9fafb",
};

const saveDraftButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 11,
  padding: "12px 20px",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const draftNoticeStyle: CSSProperties = {
  marginTop: 14,
  padding: 14,
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#f9fafb",
  color: "#4b5563",
  fontSize: 13,
  fontWeight: 700,
};
