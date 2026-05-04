"use client";

import { useState, type CSSProperties } from "react";

type UploadResult = {
  ok: boolean;
  total: number;
  matched_count: number;
  unmatched_count: number;
  unmatched?: { order_id: string; tracking_number: string }[];
};

export default function DomesticTrackingPage() {
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");

  async function uploadTrackingExcel(file: File) {
    setLoading(true);
    setMessage("");
    setResult(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/domestic/tracking-upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "운송장 업로드 실패");
        return;
      }

      setResult(json);
      setMessage("운송장 매칭 등록 완료!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Domestic Tracking Upload</h1>
        <p style={{ color: "#6b7280" }}>
          케이템즈/택배 엑셀 파일을 업로드하면 고객주문번호 기준으로 운송장번호를
          국내 주문에 자동 매칭합니다.
        </p>

        <label style={uploadBoxStyle}>
          <strong>운송장 엑셀 업로드</strong>
          <span style={{ color: "#6b7280", marginTop: 6 }}>
            .xlsx / .xls 파일 선택
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadTrackingExcel(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        {fileName ? (
          <p style={{ marginTop: 12 }}>
            선택 파일: <strong>{fileName}</strong>
          </p>
        ) : null}

        {loading ? <p>업로드 및 매칭 중...</p> : null}

        {message ? (
          <p style={{ color: result ? "#059669" : "#b91c1c", fontWeight: 800 }}>
            {message}
          </p>
        ) : null}
      </section>

      {result ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>매칭 결과</h2>

          <div style={summaryGridStyle}>
            <Summary label="전체 운송장" value={result.total} />
            <Summary label="매칭 성공" value={result.matched_count} />
            <Summary label="미매칭" value={result.unmatched_count} />
          </div>

          {result.unmatched?.length ? (
            <div style={{ marginTop: 20 }}>
              <h3>미매칭 목록</h3>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>고객주문번호</th>
                    <th style={thStyle}>운송장번호</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unmatched.map((row) => (
                    <tr key={`${row.order_id}-${row.tracking_number}`}>
                      <td style={tdStyle}>{row.order_id}</td>
                      <td style={tdStyle}>{row.tracking_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <strong style={{ fontSize: 28 }}>{value}</strong>
    </div>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const uploadBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 160,
  border: "2px dashed #d1d5db",
  borderRadius: 16,
  cursor: "pointer",
  background: "#f9fafb",
  marginTop: 18,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
};
