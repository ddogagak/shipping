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

    alert(
      `선택한 사진 ${selectedImages.length}장으로 상품 초안을 만들 준비가 됐어.\n다음 단계에서 Storage 업로드와 상품 등록 폼을 연결하면 돼.`
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
