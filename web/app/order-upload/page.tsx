"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type SkippedOrder = {
  order_number: string;
  username: string;
  reason: string;
};

type UploadResult = {
  ok?: boolean;
  saved?: number;
  skipped_count?: number;
  skipped?: SkippedOrder[];
  message?: string;
  error?: string;
  detail?: string;
};

export default function OrderUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function uploadCsv() {
    if (!file) {
      setResult({ error: "CSV 파일을 선택해 주세요." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/ebay-csv", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as UploadResult;

      if (!response.ok) {
        setResult({
          error: json.error || "업로드 실패",
          detail: json.detail,
        });
        return;
      }

      setResult(json);
    } catch (error) {
      setResult({
        error: "업로드 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Order CSV Upload</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>
              eBay 주문 CSV만 업로드합니다. 기존 DB에 같은 username + 주문번호 뒷 5자리가 있으면 자동으로 무시합니다.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/orders"
              style={{
                textDecoration: "none",
                border: "1px solid #d1d5db",
                padding: "8px 12px",
                borderRadius: 10,
                color: "#111827",
                fontWeight: 700,
              }}
            >
              주문목록
            </Link>
            <Link
              href="/"
              style={{
                textDecoration: "none",
                border: "1px solid #d1d5db",
                padding: "8px 12px",
                borderRadius: 10,
                color: "#111827",
                fontWeight: 700,
              }}
            >
              메인
            </Link>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setResult(null);
            }}
          />

          <button
            type="button"
            onClick={uploadCsv}
            disabled={loading || !file}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "10px 14px",
              background: loading || !file ? "#9ca3af" : "#111827",
              color: "#fff",
              fontWeight: 800,
              cursor: loading || !file ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "업로드 중..." : "CSV 업로드"}
          </button>

          {result?.ok ? (
            <button
              type="button"
              onClick={() => router.push("/orders")}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#fff",
                color: "#111827",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              주문목록으로 이동
            </button>
          ) : null}
        </div>
      </section>

      {result ? (
        <section
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
          }}
        >
          {result.error ? (
            <div style={{ color: "#991b1b", fontWeight: 800 }}>
              {result.error}
              {result.detail ? <div style={{ marginTop: 8, fontWeight: 500 }}>{result.detail}</div> : null}
            </div>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>업로드 결과</h2>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={summaryBoxStyle}>
                  <div style={summaryLabelStyle}>신규 저장</div>
                  <strong style={summaryNumberStyle}>{result.saved || 0}</strong>
                </div>
                <div style={summaryBoxStyle}>
                  <div style={summaryLabelStyle}>중복/무시</div>
                  <strong style={summaryNumberStyle}>{result.skipped_count || 0}</strong>
                </div>
              </div>

              {result.message ? <p>{result.message}</p> : null}

              {result.skipped?.length ? (
                <div style={{ marginTop: 18 }}>
                  <h3>무시된 주문</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>주문번호</th>
                          <th style={thStyle}>username</th>
                          <th style={thStyle}>사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.skipped.map((row, index) => (
                          <tr key={`${row.order_number}-${index}`}>
                            <td style={tdStyle}>{row.order_number}</td>
                            <td style={tdStyle}>{row.username}</td>
                            <td style={tdStyle}>{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

const summaryBoxStyle: React.CSSProperties = {
  minWidth: 140,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const summaryNumberStyle: React.CSSProperties = {
  fontSize: 28,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
  fontSize: 13,
};
