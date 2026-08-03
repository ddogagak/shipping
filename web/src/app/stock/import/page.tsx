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

type ImportImage = {
  id: string;
  file: File;
  previewUrl: string;
  selected: boolean;
  draftId: string | null;
};

type ProductMode = "single" | "variants";

type VariantDraft = {
  id: string;
  name: string;
  code: string;
  quantity: number;
};

type ProductDraft = {
  id: string;
  imageIds: string[];
  title: string;
  category: string;
  groupName: string;
  collection: string;
  itemType: string;
  mode: ProductMode;
  variants: VariantDraft[];
  expanded: boolean;
};

const SKZ_VARIANTS = [
  { name: "방찬", code: "CHAN" },
  { name: "리노", code: "KNOW" },
  { name: "창빈", code: "CBIN" },
  { name: "현진", code: "HJIN" },
  { name: "한", code: "HAN" },
  { name: "필릭스", code: "FLIX" },
  { name: "승민", code: "SMIN" },
  { name: "아이엔", code: "IN" },
] as const;

const CATEGORIES = ["SKZ", "피규어", "가챠", "랜덤굿즈", "기타"];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export default function StockImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imagesRef = useRef<ImportImage[]>([]);

  const [images, setImages] = useState<ImportImage[]>([]);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  const availableImages = useMemo(
    () => images.filter((image) => !image.draftId),
    [images]
  );

  const selectedImages = useMemo(
    () => availableImages.filter((image) => image.selected),
    [availableImages]
  );

  const assignedCount = images.length - availableImages.length;

  function addFiles(fileList: FileList | File[]) {
    const allFiles = Array.from(fileList);
    const imageFiles = allFiles.filter(isImageFile);

    if (!imageFiles.length) {
      setMessage("이미지 파일을 선택해줘.");
      return;
    }

    const next = imageFiles.map((file) => ({
      id: makeId("image"),
      file,
      previewUrl: URL.createObjectURL(file),
      selected: false,
      draftId: null,
    }));

    setImages((prev) => [...prev, ...next]);
    setMessage(`사진 ${imageFiles.length}장 추가`);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  function toggleImage(id: string) {
    setImages((prev) =>
      prev.map((image) =>
        image.id === id && !image.draftId
          ? { ...image, selected: !image.selected }
          : image
      )
    );
  }

  function selectAllAvailable(selected: boolean) {
    setImages((prev) =>
      prev.map((image) =>
        image.draftId ? image : { ...image, selected }
      )
    );
  }

  function removeSelected() {
    if (!selectedImages.length) {
      setMessage("삭제할 사진을 선택해줘.");
      return;
    }

    const targetIds = new Set(selectedImages.map((image) => image.id));
    setImages((prev) => {
      prev.forEach((image) => {
        if (targetIds.has(image.id)) URL.revokeObjectURL(image.previewUrl);
      });
      return prev.filter((image) => !targetIds.has(image.id));
    });
    setMessage(`사진 ${selectedImages.length}장 삭제`);
  }

  function openComposer() {
    if (!selectedImages.length) {
      setMessage("상품으로 묶을 사진을 선택해줘.");
      return;
    }
    setComposerOpen(true);
  }

  function createDraft(mode: ProductMode) {
    if (!selectedImages.length) return;

    const draftId = makeId("draft");
    const imageIds = selectedImages.map((image) => image.id);

    setDrafts((prev) => [
      ...prev,
      {
        id: draftId,
        imageIds,
        title: "",
        category: mode === "variants" ? "SKZ" : "피규어",
        groupName: mode === "variants" ? "Stray Kids" : "",
        collection: "",
        itemType: "",
        mode,
        variants: [],
        expanded: true,
      },
    ]);

    setImages((prev) =>
      prev.map((image) =>
        imageIds.includes(image.id)
          ? { ...image, draftId, selected: false }
          : image
      )
    );

    setComposerOpen(false);
    setMessage(`새 상품 초안 1개 생성 · 사진 ${imageIds.length}장`);

    requestAnimationFrame(() => {
      document.getElementById(`draft-${draftId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function updateDraft(id: string, patch: Partial<ProductDraft>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft))
    );
  }

  function deleteDraft(id: string) {
    const target = drafts.find((draft) => draft.id === id);
    if (!target) return;

    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    setImages((prev) =>
      prev.map((image) =>
        target.imageIds.includes(image.id)
          ? { ...image, draftId: null, selected: false }
          : image
      )
    );
    setMessage("초안을 삭제하고 사진을 미분류로 되돌렸어.");
  }

  function addVariant(draftId: string) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              mode: "variants",
              variants: [
                ...draft.variants,
                { id: makeId("variant"), name: "", code: "", quantity: 1 },
              ],
            }
          : draft
      )
    );
  }

  function loadSkzVariants(draftId: string) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              mode: "variants",
              category: "SKZ",
              groupName: "Stray Kids",
              variants: SKZ_VARIANTS.map((member) => ({
                id: makeId(member.code),
                name: member.name,
                code: member.code,
                quantity: 1,
              })),
            }
          : draft
      )
    );
  }

  function updateVariant(
    draftId: string,
    variantId: string,
    patch: Partial<VariantDraft>
  ) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              variants: draft.variants.map((variant) =>
                variant.id === variantId ? { ...variant, ...patch } : variant
              ),
            }
          : draft
      )
    );
  }

  function changeQuantity(draftId: string, variantId: string, delta: number) {
    const draft = drafts.find((item) => item.id === draftId);
    const variant = draft?.variants.find((item) => item.id === variantId);
    if (!variant) return;

    updateVariant(draftId, variantId, {
      quantity: clampQuantity(variant.quantity + delta),
    });
  }

  function removeVariant(draftId: string, variantId: string) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              variants: draft.variants.filter(
                (variant) => variant.id !== variantId
              ),
            }
          : draft
      )
    );
  }

  function imageById(id: string) {
    return images.find((image) => image.id === id);
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>STOCK Import</h1>
          <p style={subTextStyle}>사진을 먼저 묶고 상품 초안을 여러 개 만들어요.</p>
        </div>
        <Link href="/stock" style={outlineButtonStyle}>목록</Link>
      </header>

      <section style={summaryStyle}>
        <strong>전체 {images.length}</strong>
        <span>미분류 {availableImages.length}</span>
        <span>분류됨 {assignedCount}</span>
        <span>초안 {drafts.length}</span>
      </section>

      <section
        style={{ ...dropStyle, ...(dragging ? dropActiveStyle : {}) }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <strong style={{ fontSize: 17 }}>사진을 터치하거나 드래그</strong>
        <span style={subTextStyle}>여러 장을 한 번에 선택할 수 있어요.</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onFileChange}
        />
      </section>

      {message ? <div style={messageStyle}>{message}</div> : null}

      {availableImages.length ? (
        <section style={cardStyle}>
          <div style={sectionHeadStyle}>
            <div>
              <strong>미분류 사진</strong>
              <div style={subTextStyle}>선택 {selectedImages.length}장</div>
            </div>
            <div style={miniActionsStyle}>
              <button type="button" style={smallButtonStyle} onClick={() => selectAllAvailable(true)}>전체선택</button>
              <button type="button" style={smallButtonStyle} onClick={() => selectAllAvailable(false)}>해제</button>
              <button type="button" style={dangerSmallStyle} onClick={removeSelected}>삭제</button>
            </div>
          </div>

          <div style={imageGridStyle}>
            {availableImages.map((image) => (
              <button
                key={image.id}
                type="button"
                style={{
                  ...imageTileStyle,
                  ...(image.selected ? selectedTileStyle : {}),
                }}
                onClick={() => toggleImage(image.id)}
              >
                <img src={image.previewUrl} alt={image.file.name} style={imageStyle} />
                <span style={checkStyle}>{image.selected ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {drafts.length ? (
        <section style={{ display: "grid", gap: 14 }}>
          <h2 style={{ margin: "8px 0 0", fontSize: 20 }}>상품 초안</h2>

          {drafts.map((draft, draftIndex) => (
            <article key={draft.id} id={`draft-${draft.id}`} style={draftCardStyle}>
              <div style={draftHeaderStyle}>
                <button
                  type="button"
                  style={draftTitleButtonStyle}
                  onClick={() => updateDraft(draft.id, { expanded: !draft.expanded })}
                >
                  초안 {draftIndex + 1} · 사진 {draft.imageIds.length}장
                  <span>{draft.expanded ? "▲" : "▼"}</span>
                </button>
                <button type="button" style={dangerSmallStyle} onClick={() => deleteDraft(draft.id)}>삭제</button>
              </div>

              <div style={draftThumbsStyle}>
                {draft.imageIds.slice(0, 6).map((imageId) => {
                  const image = imageById(imageId);
                  return image ? <img key={imageId} src={image.previewUrl} alt="" style={draftThumbStyle} /> : null;
                })}
                {draft.imageIds.length > 6 ? <span style={moreThumbStyle}>+{draft.imageIds.length - 6}</span> : null}
              </div>

              {draft.expanded ? (
                <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <label style={labelStyle}>
                    상품명
                    <input
                      value={draft.title}
                      onChange={(event) => updateDraft(draft.id, { title: event.target.value })}
                      style={inputStyle}
                      placeholder="예: Stray Kids ATE 포토카드"
                    />
                  </label>

                  <div style={twoColumnStyle}>
                    <label style={labelStyle}>
                      카테고리
                      <select
                        value={draft.category}
                        onChange={(event) => updateDraft(draft.id, { category: event.target.value })}
                        style={inputStyle}
                      >
                        {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      단체·작품
                      <input
                        value={draft.groupName}
                        onChange={(event) => updateDraft(draft.id, { groupName: event.target.value })}
                        style={inputStyle}
                        placeholder="Stray Kids / Hunter×Hunter"
                      />
                    </label>
                  </div>

                  <div style={twoColumnStyle}>
                    <label style={labelStyle}>
                      컬렉션·활동기
                      <input
                        value={draft.collection}
                        onChange={(event) => updateDraft(draft.id, { collection: event.target.value })}
                        style={inputStyle}
                        placeholder="ATE / MAXIDENT"
                      />
                    </label>
                    <label style={labelStyle}>
                      굿즈 종류
                      <input
                        value={draft.itemType}
                        onChange={(event) => updateDraft(draft.id, { itemType: event.target.value })}
                        style={inputStyle}
                        placeholder="포토카드 / 피규어"
                      />
                    </label>
                  </div>

                  <div style={modeButtonsStyle}>
                    <button
                      type="button"
                      style={draft.mode === "single" ? activeModeStyle : modeStyle}
                      onClick={() => updateDraft(draft.id, { mode: "single" })}
                    >
                      단일상품
                    </button>
                    <button
                      type="button"
                      style={draft.mode === "variants" ? activeModeStyle : modeStyle}
                      onClick={() => updateDraft(draft.id, { mode: "variants" })}
                    >
                      하위옵션 있음
                    </button>
                  </div>

                  {draft.mode === "variants" ? (
                    <div style={variantBoxStyle}>
                      <div style={sectionHeadStyle}>
                        <strong>하위 옵션</strong>
                        <div style={miniActionsStyle}>
                          <button type="button" style={purpleSmallStyle} onClick={() => loadSkzVariants(draft.id)}>SKZ 8명</button>
                          <button type="button" style={smallButtonStyle} onClick={() => addVariant(draft.id)}>+ 옵션</button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {draft.variants.map((variant) => (
                          <div key={variant.id} style={variantRowStyle}>
                            <input
                              value={variant.name}
                              onChange={(event) => updateVariant(draft.id, variant.id, { name: event.target.value })}
                              style={{ ...inputStyle, minWidth: 0 }}
                              placeholder="옵션 이름"
                            />
                            <input
                              value={variant.code}
                              onChange={(event) => updateVariant(draft.id, variant.id, { code: event.target.value.toUpperCase() })}
                              style={codeInputStyle}
                              placeholder="CODE"
                            />
                            <div style={stepperStyle}>
                              <button type="button" style={stepButtonStyle} onClick={() => changeQuantity(draft.id, variant.id, -1)}>−</button>
                              <input
                                inputMode="numeric"
                                value={variant.quantity}
                                onChange={(event) => updateVariant(draft.id, variant.id, { quantity: clampQuantity(Number(event.target.value)) })}
                                style={qtyInputStyle}
                              />
                              <button type="button" style={stepButtonStyle} onClick={() => changeQuantity(draft.id, variant.id, 1)}>+</button>
                            </div>
                            <button type="button" style={removeVariantStyle} onClick={() => removeVariant(draft.id, variant.id)}>×</button>
                          </div>
                        ))}

                        {!draft.variants.length ? <div style={emptyOptionStyle}>옵션을 추가하거나 SKZ 8명을 불러와줘.</div> : null}
                      </div>
                    </div>
                  ) : (
                    <div style={emptyOptionStyle}>단일상품 초안입니다. 수량·위치·가격은 상세 화면에서 입력해요.</div>
                  )}
                </div>
              ) : null}
            </article>
          ))}

          <button
            type="button"
            style={saveAllStyle}
            onClick={() => setMessage(`초안 ${drafts.length}개 확인 완료. 다음 단계에서 Storage와 DB 저장을 연결하면 돼.`)}
          >
            초안 {drafts.length}개 확인
          </button>
        </section>
      ) : null}

      {selectedImages.length ? (
        <div style={bottomBarStyle}>
          <strong>선택 {selectedImages.length}장</strong>
          <button type="button" style={primaryButtonStyle} onClick={openComposer}>상품 묶음 만들기</button>
        </div>
      ) : null}

      {composerOpen ? (
        <div style={sheetBackdropStyle} onClick={() => setComposerOpen(false)}>
          <div style={bottomSheetStyle} onClick={(event) => event.stopPropagation()}>
            <div style={sheetHandleStyle} />
            <h3 style={{ margin: "4px 0 6px" }}>선택 사진으로 초안 만들기</h3>
            <p style={subTextStyle}>선택한 {selectedImages.length}장을 하나의 상품으로 묶습니다.</p>
            <button type="button" style={sheetChoiceStyle} onClick={() => createDraft("single")}>
              <strong>단일상품</strong>
              <span>피규어처럼 상위상품만 있는 경우</span>
            </button>
            <button type="button" style={sheetChoiceStyle} onClick={() => createDraft("variants")}>
              <strong>하위옵션 있음</strong>
              <span>멤버·캐릭터·번호별 재고가 있는 경우</span>
            </button>
            <button type="button" style={cancelButtonStyle} onClick={() => setComposerOpen(false)}>취소</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 880,
  margin: "0 auto",
  padding: "16px 14px 110px",
  background: "#f7f7f8",
  minHeight: "100vh",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const subTextStyle: CSSProperties = { color: "#6b7280", fontSize: 13, margin: "5px 0 0" };
const outlineButtonStyle: CSSProperties = { textDecoration: "none", color: "#111827", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 12px", fontWeight: 800 };
const summaryStyle: CSSProperties = { display: "flex", gap: 10, overflowX: "auto", padding: "10px 12px", marginBottom: 12, background: "#111827", color: "#fff", borderRadius: 14, fontSize: 13, whiteSpace: "nowrap" };
const dropStyle: CSSProperties = { minHeight: 112, border: "2px dashed #cbd5e1", borderRadius: 18, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", padding: 18 };
const dropActiveStyle: CSSProperties = { borderColor: "#7c3aed", background: "#faf5ff" };
const messageStyle: CSSProperties = { marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#eef2ff", color: "#4338ca", fontSize: 13, fontWeight: 800 };
const cardStyle: CSSProperties = { marginTop: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 12 };
const sectionHeadStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const miniActionsStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const smallButtonStyle: CSSProperties = { border: "1px solid #d1d5db", background: "#fff", borderRadius: 9, padding: "7px 9px", fontWeight: 800, fontSize: 12 };
const dangerSmallStyle: CSSProperties = { ...smallButtonStyle, borderColor: "#fecaca", color: "#b91c1c", background: "#fff1f2" };
const purpleSmallStyle: CSSProperties = { ...smallButtonStyle, borderColor: "#ddd6fe", color: "#6d28d9", background: "#f5f3ff" };
const imageGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7, marginTop: 12 };
const imageTileStyle: CSSProperties = { position: "relative", aspectRatio: "1 / 1", border: "2px solid transparent", borderRadius: 12, overflow: "hidden", padding: 0, background: "#e5e7eb" };
const selectedTileStyle: CSSProperties = { borderColor: "#7c3aed", boxShadow: "0 0 0 2px #ddd6fe" };
const imageStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const checkStyle: CSSProperties = { position: "absolute", top: 6, right: 6, width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 999, background: "rgba(17,24,39,.8)", color: "#fff", fontWeight: 900 };
const draftCardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 12 };
const draftHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" };
const draftTitleButtonStyle: CSSProperties = { border: 0, background: "transparent", padding: 0, fontWeight: 900, fontSize: 15, display: "flex", gap: 8, alignItems: "center" };
const draftThumbsStyle: CSSProperties = { display: "flex", gap: 6, overflowX: "auto", marginTop: 10 };
const draftThumbStyle: CSSProperties = { width: 58, height: 58, objectFit: "cover", borderRadius: 9, flex: "0 0 auto" };
const moreThumbStyle: CSSProperties = { width: 58, height: 58, borderRadius: 9, display: "grid", placeItems: "center", background: "#f3f4f6", fontWeight: 900, flex: "0 0 auto" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 11px", background: "#fff", fontSize: 14 };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const modeButtonsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const modeStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 11, padding: "10px", background: "#fff", fontWeight: 800 };
const activeModeStyle: CSSProperties = { ...modeStyle, borderColor: "#7c3aed", background: "#f5f3ff", color: "#6d28d9" };
const variantBoxStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 10, background: "#fafafa" };
const variantRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(92px, 1fr) 74px auto 30px", gap: 6, alignItems: "center" };
const codeInputStyle: CSSProperties = { ...inputStyle, width: 74, paddingInline: 7, textAlign: "center", fontWeight: 900, fontSize: 12 };
const stepperStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px 42px 34px", alignItems: "center", border: "1px solid #d1d5db", borderRadius: 10, overflow: "hidden", background: "#fff" };
const stepButtonStyle: CSSProperties = { height: 38, border: 0, background: "#f3f4f6", fontSize: 20, fontWeight: 900 };
const qtyInputStyle: CSSProperties = { width: 42, height: 38, border: 0, textAlign: "center", fontWeight: 900, padding: 0 };
const removeVariantStyle: CSSProperties = { width: 30, height: 30, borderRadius: 999, border: 0, background: "#fee2e2", color: "#b91c1c", fontWeight: 900 };
const emptyOptionStyle: CSSProperties = { padding: 12, background: "#f9fafb", color: "#6b7280", borderRadius: 10, fontSize: 13 };
const saveAllStyle: CSSProperties = { border: 0, borderRadius: 14, padding: "14px 16px", background: "#111827", color: "#fff", fontWeight: 900, fontSize: 15 };
const bottomBarStyle: CSSProperties = { position: "fixed", left: "50%", bottom: 14, transform: "translateX(-50%)", width: "calc(100% - 28px)", maxWidth: 852, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(17,24,39,.96)", color: "#fff", borderRadius: 16, padding: "10px 12px", boxShadow: "0 14px 40px rgba(0,0,0,.24)", zIndex: 30 };
const primaryButtonStyle: CSSProperties = { border: 0, borderRadius: 11, padding: "11px 14px", background: "#7c3aed", color: "#fff", fontWeight: 900 };
const sheetBackdropStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const bottomSheetStyle: CSSProperties = { width: "100%", maxWidth: 880, background: "#fff", borderRadius: "22px 22px 0 0", padding: "12px 16px 24px", boxShadow: "0 -20px 50px rgba(0,0,0,.2)" };
const sheetHandleStyle: CSSProperties = { width: 42, height: 5, borderRadius: 999, background: "#d1d5db", margin: "0 auto 12px" };
const sheetChoiceStyle: CSSProperties = { width: "100%", display: "grid", gap: 3, textAlign: "left", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14, marginTop: 10 };
const cancelButtonStyle: CSSProperties = { width: "100%", border: 0, borderRadius: 12, background: "#f3f4f6", padding: 12, marginTop: 10, fontWeight: 800 };
