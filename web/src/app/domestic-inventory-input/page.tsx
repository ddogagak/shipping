"use client";

import { useMemo, useState } from "react";

type PreviewItem = {
  item_name: string;
  order_number: string;
  order_date: string;
  yen_price: number;
  shipping_fee: number;
  total_price: number;
  tracking_number: string;
  image_url: string;
  quantity: number;
  status: string;
  memo: string;
};

export default function DomesticInventoryInputPage() {
  const [rawText, setRawText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [memo, setMemo] = useState("");

  const preview = useMemo<PreviewItem>(() => {
    const orderNumber =
      rawText.match(/Order\s?#\s*([\d-]+)/i)?.[1] ?? "";

    const orderDate =
      rawText.match(/Order placed\s*([A-Za-z]+\s\d{1,2},\s\d{4})/i)?.[1] ??
      "";

    const yenText =
      rawText.match(/Grand Total:\s*¥([\d,]+)/i)?.[1] ?? "0";

    const yenPrice = Number(yenText.replaceAll(",", ""));

    const itemName =
      rawText.match(/Delivered[\s\S]*?\n(.+?)\nTV Anime/i)?.[1]?.trim() ??
      "";

    return {
      item_name: itemName,
      order_number: orderNumber,
      order_date: orderDate,
      yen_price: yenPrice,
      shipping_fee: 0,
      total_price: yenPrice,
      tracking_number: trackingNumber,
      image_url: imageUrl,
      quantity: 1,
      status: "입고전",
      memo,
    };
  }, [rawText, imageUrl, trackingNumber, memo]);

  return (
    <main
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        국내 재고 입력
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* 입력 영역 */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 20,
            background: "#fff",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            주문내역 입력
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="아마존 / 구매내역 텍스트 붙여넣기"
              style={{
                width: "100%",
                minHeight: 320,
                padding: 12,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />

            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="이미지 URL"
              style={inputStyle}
            />

            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="운송장번호"
              style={inputStyle}
            />

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
              style={{
                ...inputStyle,
                minHeight: 100,
              }}
            />

            <button
              style={{
                height: 44,
                border: "none",
                borderRadius: 8,
                background: "#111827",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              재고 저장
            </button>
          </div>
        </div>

        {/* 미리보기 */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {preview.image_url ? (
            <img
              src={preview.image_url}
              alt=""
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                background: "#f3f4f6",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              이미지 미리보기
            </div>
          )}

          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                lineHeight: 1.4,
              }}
            >
              {preview.item_name || "상품명"}
            </div>

            <InfoRow
              label="주문번호"
              value={preview.order_number}
            />

            <InfoRow
              label="주문일"
              value={preview.order_date}
            />

            <InfoRow
              label="금액"
              value={`¥${preview.total_price.toLocaleString()}`}
            />

            <InfoRow
              label="운송장"
              value={preview.tracking_number}
            />

            <InfoRow
              label="상태"
              value={preview.status}
            />

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: "#f9fafb",
                fontSize: 13,
                whiteSpace: "pre-wrap",
              }}
            >
              {preview.memo || "메모 없음"}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 14,
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>

      <span style={{ fontWeight: 600 }}>{value || "-"}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
};
