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
  coverImageId: string;
  title: string;
  category: string;
  groupName: string;
  collection: string;
  itemType: string;
  mode: ProductMode;
  variants: VariantDraft[];
  expanded: boolean;
};

type StoredImportImage = Omit<ImportImage, "previewUrl">;

type StockWorkRecord = {
  id: string;
  name: string;
  images: StoredImportImage[];
  drafts: ProductDraft[];
  createdAt: string;
  updatedAt: string;
};

const WORK_DB_NAME = "ddoga-stock-import";
const WORK_DB_VERSION = 1;
const WORK_STORE_NAME = "works";
const ACTIVE_WORK_KEY = "ddoga-stock-active-work";

function openWorkDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORK_DB_NAME, WORK_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORK_STORE_NAME)) {
        db.createObjectStore(WORK_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 열기 실패"));
  });
}

async function listWorkRecords(): Promise<StockWorkRecord[]> {
  const db = await openWorkDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORK_STORE_NAME, "readonly");
    const request = tx.objectStore(WORK_STORE_NAME).getAll();
    request.onsuccess = () => {
      const rows = (request.result || []) as StockWorkRecord[];
      resolve(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    };
    request.onerror = () => reject(request.error || new Error("작업 목록 조회 실패"));
    tx.oncomplete = () => db.close();
  });
}

async function getWorkRecord(id: string): Promise<StockWorkRecord | null> {
  const db = await openWorkDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORK_STORE_NAME, "readonly");
    const request = tx.objectStore(WORK_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as StockWorkRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("작업 불러오기 실패"));
    tx.oncomplete = () => db.close();
  });
}

async function putWorkRecord(record: StockWorkRecord): Promise<void> {
  const db = await openWorkDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORK_STORE_NAME, "readwrite");
    tx.objectStore(WORK_STORE_NAME).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("작업 저장 실패")); };
  });
}

async function removeWorkRecord(id: string): Promise<void> {
  const db = await openWorkDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORK_STORE_NAME, "readwrite");
    tx.objectStore(WORK_STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("작업 삭제 실패")); };
  });
}

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
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeWorkId, setActiveWorkId] = useState("");
  const [workName, setWorkName] = useState("");
  const [workList, setWorkList] = useState<StockWorkRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState("준비 중");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const works = await listWorkRecords();
        if (cancelled) return;
        setWorkList(works);

        const savedActiveId = localStorage.getItem(ACTIVE_WORK_KEY) || works[0]?.id || "";
        const target = savedActiveId ? await getWorkRecord(savedActiveId) : null;

        if (target) {
          const restoredImages: ImportImage[] = target.images.map((image) => ({
            ...image,
            previewUrl: URL.createObjectURL(image.file),
          }));
          setActiveWorkId(target.id);
          setWorkName(target.name);
          setImages(restoredImages);
          setDrafts(target.drafts || []);
          localStorage.setItem(ACTIVE_WORK_KEY, target.id);
          setMessage(`작업중인 초안을 복구했어 · 사진 ${restoredImages.length}장`);
        } else {
          const id = makeId("work");
          const now = new Date().toISOString();
          const fresh: StockWorkRecord = {
            id,
            name: `작업 ${new Date().toLocaleDateString("ko-KR")}`,
            images: [],
            drafts: [],
            createdAt: now,
            updatedAt: now,
          };
          await putWorkRecord(fresh);
          if (cancelled) return;
          setActiveWorkId(id);
          setWorkName(fresh.name);
          setWorkList([fresh]);
          localStorage.setItem(ACTIVE_WORK_KEY, id);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "임시작업 불러오기 실패");
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setAutosaveStatus("자동저장 켜짐");
        }
      }
    }

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated || !activeWorkId) return;

    setAutosaveStatus("저장 중...");
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const record: StockWorkRecord = {
        id: activeWorkId,
        name: workName.trim() || "이름 없는 작업",
        images: images.map(({ previewUrl: _previewUrl, ...image }) => image),
        drafts,
        createdAt:
          workList.find((work) => work.id === activeWorkId)?.createdAt || now,
        updatedAt: now,
      };

      void putWorkRecord(record)
        .then(async () => {
          const works = await listWorkRecords();
          setWorkList(works);
          setAutosaveStatus(`자동저장 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
        })
        .catch((error) => {
          setAutosaveStatus("자동저장 실패");
          setMessage(error instanceof Error ? error.message : "자동저장 실패");
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [activeWorkId, drafts, hydrated, images, workName]);

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
  const progressPercent = images.length
    ? Math.round((assignedCount / images.length) * 100)
    : 0;

  function revokeCurrentPreviewUrls() {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }

  async function switchWork(id: string) {
    if (!id || id === activeWorkId) return;
    const target = await getWorkRecord(id);
    if (!target) return;

    revokeCurrentPreviewUrls();
    const restoredImages: ImportImage[] = target.images.map((image) => ({
      ...image,
      previewUrl: URL.createObjectURL(image.file),
    }));
    setActiveWorkId(target.id);
    setWorkName(target.name);
    setImages(restoredImages);
    setDrafts(target.drafts || []);
    setComposerOpen(false);
    setAssignSheetOpen(false);
    setReviewOpen(false);
    localStorage.setItem(ACTIVE_WORK_KEY, target.id);
    setMessage(`작업 전환 완료 · 사진 ${restoredImages.length}장`);
  }

  async function createNewWork() {
    const id = makeId("work");
    const now = new Date().toISOString();
    const record: StockWorkRecord = {
      id,
      name: `새 작업 ${new Date().toLocaleDateString("ko-KR")}`,
      images: [],
      drafts: [],
      createdAt: now,
      updatedAt: now,
    };
    await putWorkRecord(record);
    revokeCurrentPreviewUrls();
    setActiveWorkId(id);
    setWorkName(record.name);
    setImages([]);
    setDrafts([]);
    setWorkList(await listWorkRecords());
    localStorage.setItem(ACTIVE_WORK_KEY, id);
    setMessage("새 작업을 만들었어.");
  }

  async function deleteCurrentWork() {
    if (!activeWorkId) return;
    if (!confirm("현재 작업과 임시 사진을 삭제할까?")) return;

    await removeWorkRecord(activeWorkId);
    revokeCurrentPreviewUrls();
    const remaining = await listWorkRecords();
    setWorkList(remaining);

    if (remaining.length) {
      await switchWork(remaining[0].id);
    } else {
      setActiveWorkId("");
      setWorkName("");
      setImages([]);
      setDrafts([]);
      localStorage.removeItem(ACTIVE_WORK_KEY);
      await createNewWork();
    }
  }

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
        coverImageId: imageIds[0] || "",
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

  function setCoverImage(draftId: string, imageId: string) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId && draft.imageIds.includes(imageId)
          ? { ...draft, coverImageId: imageId }
          : draft
      )
    );
  }

  function unassignImage(draftId: string, imageId: string) {
    setDrafts((prev) =>
      prev
        .map((draft) => {
          if (draft.id !== draftId) return draft;
          const nextImageIds = draft.imageIds.filter((id) => id !== imageId);
          return {
            ...draft,
            imageIds: nextImageIds,
            coverImageId:
              draft.coverImageId === imageId
                ? nextImageIds[0] || ""
                : draft.coverImageId,
          };
        })
        .filter((draft) => draft.imageIds.length > 0)
    );

    setImages((prev) =>
      prev.map((image) =>
        image.id === imageId
          ? { ...image, draftId: null, selected: false }
          : image
      )
    );
    setMessage("사진을 미분류로 되돌렸어.");
  }

  function addSelectedToDraft(draftId: string) {
    if (!selectedImages.length) return;
    const imageIds = selectedImages.map((image) => image.id);

    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              imageIds: [...draft.imageIds, ...imageIds],
              coverImageId: draft.coverImageId || imageIds[0] || "",
            }
          : draft
      )
    );
    setImages((prev) =>
      prev.map((image) =>
        imageIds.includes(image.id)
          ? { ...image, draftId, selected: false }
          : image
      )
    );
    setAssignSheetOpen(false);
    setMessage(`기존 초안에 사진 ${imageIds.length}장 추가`);
  }

  function draftIssues(draft: ProductDraft) {
    const issues: string[] = [];
    if (!draft.title.trim()) issues.push("상품명 없음");
    if (!draft.imageIds.length) issues.push("사진 없음");
    if (draft.mode === "variants") {
      if (!draft.variants.length) issues.push("하위옵션 없음");
      if (draft.variants.some((variant) => !variant.name.trim()))
        issues.push("옵션 이름 누락");
      if (draft.variants.some((variant) => !variant.code.trim()))
        issues.push("옵션 코드 누락");
    }
    return issues;
  }

  function openReview() {
    if (!drafts.length) {
      setMessage("확인할 초안이 없어.");
      return;
    }
    setReviewOpen(true);
  }

  if (!hydrated) {
    return (
      <main style={pageStyle}>
        <div style={{ ...cardStyle, marginTop: 40, textAlign: "center" }}>작업중인 사진을 불러오는 중...</div>
      </main>
    );
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

      <section style={workPanelStyle}>
        <div style={{ display: "grid", gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>작업중</strong>
            <span style={autosaveTextStyle}>{autosaveStatus}</span>
          </div>
          <input
            value={workName}
            onChange={(event) => setWorkName(event.target.value)}
            style={workNameInputStyle}
            placeholder="작업 이름"
          />
          <select
            value={activeWorkId}
            onChange={(event) => void switchWork(event.target.value)}
            style={workSelectStyle}
          >
            {workList.map((work) => (
              <option key={work.id} value={work.id}>
                {work.name} · 사진 {work.images.length} · 초안 {work.drafts.length}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <button type="button" style={smallButtonStyle} onClick={() => void createNewWork()}>+ 새 작업</button>
          <button type="button" style={dangerSmallStyle} onClick={() => void deleteCurrentWork()}>작업 삭제</button>
        </div>
      </section>

      <section style={progressCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>분류 진행률</strong>
          <strong>{progressPercent}%</strong>
        </div>
        <div style={progressTrackStyle}>
          <div style={{ ...progressFillStyle, width: `${progressPercent}%` }} />
        </div>
        <div style={progressMetaStyle}>
          <span>전체 {images.length}장</span>
          <span>분류 {assignedCount}장</span>
          <span>미분류 {availableImages.length}장</span>
        </div>
      </section>

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
                {draft.imageIds.map((imageId) => {
                  const image = imageById(imageId);
                  if (!image) return null;
                  const isCover = draft.coverImageId === imageId;

                  return (
                    <div key={imageId} style={draftThumbWrapStyle}>
                      <button
                        type="button"
                        style={{ ...coverThumbButtonStyle, ...(isCover ? coverSelectedStyle : {}) }}
                        onClick={() => setCoverImage(draft.id, imageId)}
                        title="대표사진 지정"
                      >
                        <img src={image.previewUrl} alt="" style={draftThumbStyle} />
                        <span style={coverBadgeStyle}>{isCover ? "대표" : "☆"}</span>
                      </button>
                      <button
                        type="button"
                        style={unassignButtonStyle}
                        onClick={() => unassignImage(draft.id, imageId)}
                        aria-label="미분류로 되돌리기"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
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
                              style={{ ...inputStyle, minWidth: 0, padding: "9px 7px", fontSize: 13 }}
                              placeholder="이름"
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
            onClick={openReview}
          >
            초안 {drafts.length}개 일괄 저장 검수
          </button>
        </section>
      ) : null}

      {selectedImages.length ? (
        <div style={bottomBarStyle}>
          <strong>선택 {selectedImages.length}장</strong>
          <div style={{ display: "flex", gap: 7 }}>
            {drafts.length ? (
              <button type="button" style={secondaryBottomButtonStyle} onClick={() => setAssignSheetOpen(true)}>기존 초안에 추가</button>
            ) : null}
            <button type="button" style={primaryButtonStyle} onClick={openComposer}>새 상품 묶음</button>
          </div>
        </div>
      ) : null}

      {assignSheetOpen ? (
        <div style={sheetBackdropStyle} onClick={() => setAssignSheetOpen(false)}>
          <div style={bottomSheetStyle} onClick={(event) => event.stopPropagation()}>
            <div style={sheetHandleStyle} />
            <h3 style={{ margin: "4px 0 6px" }}>기존 초안에 사진 추가</h3>
            <p style={subTextStyle}>선택한 {selectedImages.length}장을 넣을 초안을 골라줘.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {drafts.map((draft, index) => (
                <button key={draft.id} type="button" style={sheetChoiceStyle} onClick={() => addSelectedToDraft(draft.id)}>
                  <strong>초안 {index + 1} · {draft.title || "상품명 미입력"}</strong>
                  <span>현재 사진 {draft.imageIds.length}장</span>
                </button>
              ))}
            </div>
            <button type="button" style={cancelButtonStyle} onClick={() => setAssignSheetOpen(false)}>취소</button>
          </div>
        </div>
      ) : null}

      {reviewOpen ? (
        <div style={sheetBackdropStyle} onClick={() => setReviewOpen(false)}>
          <div style={{ ...bottomSheetStyle, maxHeight: "82vh", overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={sheetHandleStyle} />
            <h3 style={{ margin: "4px 0 6px" }}>일괄 저장 전 검수</h3>
            <p style={subTextStyle}>아직 DB에는 저장되지 않아요. 누락된 항목을 확인하는 화면입니다.</p>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {drafts.map((draft, index) => {
                const issues = draftIssues(draft);
                const cover = imageById(draft.coverImageId);
                return (
                  <div key={draft.id} style={reviewCardStyle}>
                    {cover ? <img src={cover.previewUrl} alt="" style={reviewImageStyle} /> : <div style={reviewImageEmptyStyle}>사진 없음</div>}
                    <div style={{ minWidth: 0 }}>
                      <strong>초안 {index + 1} · {draft.title || "상품명 미입력"}</strong>
                      <div style={subTextStyle}>사진 {draft.imageIds.length}장 · {draft.mode === "variants" ? `옵션 ${draft.variants.length}개` : "단일상품"}</div>
                      <div style={{ marginTop: 6, color: issues.length ? "#b45309" : "#047857", fontWeight: 900, fontSize: 12 }}>
                        {issues.length ? `확인 필요: ${issues.join(" / ")}` : "저장 준비 완료"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              style={saveAllStyle}
              onClick={() => {
                const issueCount = drafts.filter((draft) => draftIssues(draft).length).length;
                setReviewOpen(false);
                setMessage(issueCount ? `초안 ${issueCount}개에 확인할 항목이 있어.` : "모든 초안 검수 완료. 다음 단계에서 압축·Storage·DB 저장을 연결하면 돼.");
              }}
            >
              검수 완료
            </button>
            <button type="button" style={cancelButtonStyle} onClick={() => setReviewOpen(false)}>닫기</button>
          </div>
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

const workPanelStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "stretch",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 12,
  marginBottom: 10,
};
const workNameInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: 0,
  borderBottom: "1px solid #e5e7eb",
  padding: "5px 2px 7px",
  fontSize: 16,
  fontWeight: 900,
  outline: "none",
};
const workSelectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #d1d5db",
  borderRadius: 9,
  padding: "7px 8px",
  background: "#fff",
  fontSize: 12,
};
const autosaveTextStyle: CSSProperties = {
  color: "#047857",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const progressCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 12,
  marginBottom: 10,
};
const progressTrackStyle: CSSProperties = {
  height: 9,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 9,
};
const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "#7c3aed",
  borderRadius: 999,
  transition: "width .2s ease",
};
const progressMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 7,
  color: "#6b7280",
  fontSize: 11,
  fontWeight: 700,
};

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
const draftThumbWrapStyle: CSSProperties = { position: "relative", flex: "0 0 auto" };
const coverThumbButtonStyle: CSSProperties = { position: "relative", border: "2px solid transparent", borderRadius: 11, padding: 0, background: "transparent", overflow: "hidden" };
const coverSelectedStyle: CSSProperties = { borderColor: "#7c3aed" };
const draftThumbStyle: CSSProperties = { width: 66, height: 66, objectFit: "cover", display: "block" };
const coverBadgeStyle: CSSProperties = { position: "absolute", left: 4, bottom: 4, borderRadius: 999, background: "rgba(17,24,39,.84)", color: "#fff", padding: "2px 6px", fontSize: 10, fontWeight: 900 };
const unassignButtonStyle: CSSProperties = { position: "absolute", top: -5, right: -5, width: 23, height: 23, borderRadius: 999, border: "2px solid #fff", background: "#dc2626", color: "#fff", fontWeight: 900, lineHeight: 1 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 11px", background: "#fff", fontSize: 14 };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const modeButtonsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const modeStyle: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 11, padding: "10px", background: "#fff", fontWeight: 800 };
const activeModeStyle: CSSProperties = { ...modeStyle, borderColor: "#7c3aed", background: "#f5f3ff", color: "#6d28d9" };
const variantBoxStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 10, background: "#fafafa" };
const variantRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(72px, 96px) 56px minmax(124px, 1fr) 28px",
  gap: 4,
  alignItems: "center",
};
const codeInputStyle: CSSProperties = {
  ...inputStyle,
  width: 56,
  minWidth: 0,
  padding: "9px 4px",
  textAlign: "center",
  fontWeight: 900,
  fontSize: 11,
};
const stepperStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px 38px 40px",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
  minWidth: 118,
};
const stepButtonStyle: CSSProperties = {
  width: 40,
  height: 42,
  border: 0,
  background: "#f3f4f6",
  fontSize: 22,
  fontWeight: 900,
  cursor: "pointer",
  touchAction: "manipulation",
};
const qtyInputStyle: CSSProperties = {
  width: 38,
  height: 42,
  border: 0,
  textAlign: "center",
  fontWeight: 900,
  padding: 0,
  fontSize: 14,
};
const removeVariantStyle: CSSProperties = { width: 30, height: 30, borderRadius: 999, border: 0, background: "#fee2e2", color: "#b91c1c", fontWeight: 900 };
const emptyOptionStyle: CSSProperties = { padding: 12, background: "#f9fafb", color: "#6b7280", borderRadius: 10, fontSize: 13 };
const saveAllStyle: CSSProperties = { border: 0, borderRadius: 14, padding: "14px 16px", background: "#111827", color: "#fff", fontWeight: 900, fontSize: 15 };
const bottomBarStyle: CSSProperties = { position: "fixed", left: "50%", bottom: 14, transform: "translateX(-50%)", width: "calc(100% - 28px)", maxWidth: 852, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(17,24,39,.96)", color: "#fff", borderRadius: 16, padding: "10px 12px", boxShadow: "0 14px 40px rgba(0,0,0,.24)", zIndex: 30 };
const primaryButtonStyle: CSSProperties = { border: 0, borderRadius: 11, padding: "11px 14px", background: "#7c3aed", color: "#fff", fontWeight: 900 };
const secondaryBottomButtonStyle: CSSProperties = { border: "1px solid #6b7280", borderRadius: 11, padding: "10px 11px", background: "#fff", color: "#111827", fontWeight: 900, fontSize: 12 };
const sheetBackdropStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const bottomSheetStyle: CSSProperties = { width: "100%", maxWidth: 880, background: "#fff", borderRadius: "22px 22px 0 0", padding: "12px 16px 24px", boxShadow: "0 -20px 50px rgba(0,0,0,.2)" };
const sheetHandleStyle: CSSProperties = { width: 42, height: 5, borderRadius: 999, background: "#d1d5db", margin: "0 auto 12px" };
const sheetChoiceStyle: CSSProperties = { width: "100%", display: "grid", gap: 3, textAlign: "left", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 14, marginTop: 10 };
const cancelButtonStyle: CSSProperties = { width: "100%", border: 0, borderRadius: 12, background: "#f3f4f6", padding: 12, marginTop: 10, fontWeight: 800 };

const reviewCardStyle: CSSProperties = { display: "grid", gridTemplateColumns: "64px minmax(0, 1fr)", gap: 10, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 13, padding: 9 };
const reviewImageStyle: CSSProperties = { width: 64, height: 64, objectFit: "cover", borderRadius: 10 };
const reviewImageEmptyStyle: CSSProperties = { width: 64, height: 64, borderRadius: 10, background: "#f3f4f6", display: "grid", placeItems: "center", fontSize: 11, color: "#6b7280" };
