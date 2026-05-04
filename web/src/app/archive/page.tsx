"use client";

import { useEffect, useState, type CSSProperties } from "react";

type ArchiveFile = {
  name: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  };
};

function formatSize(size?: number) {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function displayName(name: string) {
  return name.replace(/^\d+_/, "");
}

export default function ArchivePage() {
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/archive/list", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "목록 조회 실패");
        return;
      }

      setFiles(json.files || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File) {
    setLoading(true);
    setMessage("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/archive/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.detail || json.error || "업로드 실패");
        return;
      }

      setMessage("업로드 완료!");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function download(path: string) {
    const res = await fetch("/api/archive/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "다운로드 실패");
      return;
    }

    window.open(json.url, "_blank");
  }

  async function remove(path: string) {
    if (!confirm("이 파일을 삭제할까?")) return;

    const res = await fetch("/api/archive/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.detail || json.error || "삭제 실패");
      return;
    }

    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>보관소</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          PDF / 엑셀 파일을 간단히 업로드하고 내려받는 공간입니다.
        </p>

        <label style={uploadBoxStyle}>
          <strong>파일 업로드</strong>
          <span style={{ color: "#6b7280", marginTop: 6 }}>
            PDF, XLS, XLSX 파일만 가능
          </span>
          <input
            type="file"
            accept=".pdf,.xls,.xlsx"
            style={{ display: "none" }}
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        {message ? (
          <p style={{ color: message.includes("완료") ? "#059669" : "#b91c1c" }}>
            {message}
          </p>
        ) : null}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={headerRowStyle}>
          <h2 style={{ margin: 0 }}>파일 목록</h2>
          <button type="button" onClick={() => void load()} style={blackButtonStyle}>
            새로고침
          </button>
        </div>

        {loading ? (
          <p>불러오는 중...</p>
        ) : files.length ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>파일명</th>
                <th style={thStyle}>크기</th>
                <th style={thStyle}>업로드일</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.name}>
                  <td style={tdStyle}>{displayName(file.name)}</td>
                  <td style={tdStyle}>{formatSize(file.metadata?.size)}</td>
                  <td style={tdStyle}>
                    {file.created_at
                      ? new Date(file.created_at).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => void download(file.name)}
                      style={smallButtonStyle}
                    >
                      다운로드
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(file.name)}
                      style={dangerButtonStyle}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#6b7280" }}>보관된 파일이 없습니다.</p>
        )}
      </section>
    </main>
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

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
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

const blackButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  ...blackButtonStyle,
  padding: "7px 10px",
  marginRight: 6,
};

const dangerButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  background: "#dc2626",
};
