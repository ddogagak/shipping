"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewOrder = {
  selected: boolean;
  order_number: string;
  username: string;
  name: string;
  country_code: string;
  quantity: number;
  order_date: string | null;
  item_list: string;
  shipping_method: string;
  order_status: string;
  parsed_order: unknown;
};

type DuplicateOrder = {
  order_number: string;
  username: string;
  name?: string;
  country_code?: string;
  quantity?: number;
  reason: string;
};

type PreviewResult = {
  ok?: boolean;
  fresh?: PreviewOrder[];
  duplicated?: DuplicateOrder[];
  fresh_count?: number;
  duplicated_count?: number;
  error?: string;
  detail?: string;
};

type SaveResult = {
  ok?: boolean;
  saved?: number;
  skipped_count?: number;
  skipped?: DuplicateOrder[];
  error?: string;
  detail?: string;
};

export default function OrderUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fresh, setFresh] = useState<PreviewOrder[]>([]);
  const [duplicated, setDuplicated] = useState<DuplicateOrder[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCount = useMemo(
    () => fresh.filter((row) => row.selected).length,
    [fresh]
  );

  async function previewCsv() {
    if (!file) {
      setError("CSV 파일을 선택해 주세요.");
      return;
    }

    setLoadingPreview(true);
    setError("");
    setMessage("");
    setFresh([]);
    setDuplicated([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "preview");

      const response = await fetch("/api/import/ebay-csv", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as PreviewResult;

      if (!response.ok) {
        setError(json.detail || json.error || "미리보기 실패");
        return;
      }

      setFresh(json.fresh || []);
      setDuplicated(json.duplicated || []);
      setMessage(
        `미리보기 완료: 업로드 가능 ${json.fresh_count || 0}건 / 중복 ${
          json.duplicated_count || 0
        }건`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function saveSelected() {
    if (!selectedCount) {
      setError("저장할 신규 주문을 선택해 주세요.");
      return;
    }

    const ok = confirm(`선택한 신규 주문 ${selectedCount}건을 저장할까?`);
    if (!ok) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const selectedOrders = fresh.filter((row) => row.selected);

      const response = await fetch("/api/import/ebay-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "save",
          orders: selectedOrders.map((row) => row.parsed_order),
        }),
      });

      const json = (await response.json()) as SaveResult;

      if (!response.ok) {
        setError(json.detail || json.error || "저장 실패");
        return;
      }

      setMessage(
        `저장 완료: ${json.saved || 0}건 / 저장 제외 ${
          json.skipped_count || 0
        }건`
      );

      if (json.saved) {
        setFresh((prev) => prev.filter((row) => !row.selected));
      }

      if (json.skipped?.length) {
        setDuplicated((prev) => [...prev, ...(json.skipped || [])]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
    }
  }

  function toggleOne(index: number, selected: boolean) {
    setFresh((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, selected } : row
      )
    );
  }

  function toggleAll(selected: boolean) {
    setFresh((prev) => prev.map((row) => ({ ...row, selected })));
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
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
              eBay 주문 CSV를 먼저 검토한 뒤, 신규 주문만 선택해서 저장합니다.
              중복 주문은 하단에 표시되고 선택할 수 없습니다.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/orders" style={linkButtonStyle}>
              주문목록
            </Link>
            <Link href="/" style={linkButtonStyle}>
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
              setFresh([]);
              setDuplicated([]);
              setMessage("");
              setError("");
            }}
          />

          <button
            type="button"
            onClick={previewCsv}
            disabled={loadingPreview || !file}
            style={primaryButtonStyle(!!file && !loadingPreview)}
          >
            {loadingPreview ? "검토 중..." : "CSV 미리보기"}
          </button>

          {message && (
            <button
              type="button"
              onClick={() => router.push("/orders")}
              style={outlineButtonStyle}
            >
              주문목록으로 이동
            </button>
          )}
        </div>

        {message ? <p style={{ color: "#374151" }}>{message}</p> : null}
        {error ? <p style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</p> : null}
      </section>

      {fresh.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>업로드할 주문</h2>
              <p style={{ color: "#6b7280", margin: "6px 0 0" }}>
                신규 주문은 기본 선택되어 있습니다. 저장하지 않을 주문은 체크를
                해제하세요.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={fresh.length > 0 && fresh.every((row) => row.selected)}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                전체선택
              </label>

              <button
                type="button"
                onClick={saveSelected}
                disabled={saving || !selectedCount}
                style={darkButtonStyle(!!selectedCount && !saving)}
              >
                {saving ? "저장 중..." : `선택 ${selectedCount}건 저장`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>주문번호</th>
                  <th style={thStyle}>username</th>
                  <th style={thStyle}>수취인</th>
                  <th style={thStyle}>국가</th>
                  <th style={thStyle}>수량</th>
                  <th style={thStyle}>배송방식</th>
                  <th style={thStyle}>상품</th>
                </tr>
              </thead>
              <tbody>
                {fresh.map((row, index) => (
                  <tr key={`${row.order_number}-${index}`}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) =>
                          toggleOne(index, event.target.checked)
                        }
                      />
                    </td>
                    <td style={tdStyle}>{row.order_number}</td>
                    <td style={tdStyle}>{row.username}</td>
                    <td style={tdStyle}>{row.name}</td>
                    <td style={tdStyle}>{row.country_code}</td>
                    <td style={tdStyle}>{row.quantity}</td>
                    <td style={tdStyle}>{row.shipping_method}</td>
                    <td style={{ ...tdStyle, minWidth: 320 }}>{row.item_list}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {duplicated.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>중복 / 저장 제외 주문</h2>
          <p style={{ color: "#6b7280" }}>
            아래 주문은 기존 DB 또는 CSV 내부 중복으로 저장 대상에서 제외됩니다.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>주문번호</th>
                  <th style={thStyle}>username</th>
                  <th style={thStyle}>수취인</th>
                  <th style={thStyle}>국가</th>
                  <th style={thStyle}>사유</th>
                </tr>
              </thead>
              <tbody>
                {duplicated.map((row, index) => (
                  <tr key={`${row.order_number}-${index}`}>
                    <td style={tdStyle}>
                      <input type="checkbox" disabled />
                    </td>
                    <td style={tdStyle}>{row.order_number}</td>
                    <td style={tdStyle}>{row.username}</td>
                    <td style={tdStyle}>{row.name || "-"}</td>
                    <td style={tdStyle}>{row.country_code || "-"}</td>
                    <td style={tdStyle}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const linkButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d1d5db",
  padding: "8px 12px",
  borderRadius: 10,
  color: "#111827",
  fontWeight: 700,
};

function primaryButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    background: active ? "#2563eb" : "#9ca3af",
    color: "#fff",
    fontWeight: 800,
    cursor: active ? "pointer" : "not-allowed",
  };
}

function darkButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    background: active ? "#111827" : "#9ca3af",
    color: "#fff",
    fontWeight: 800,
    cursor: active ? "pointer" : "not-allowed",
  };
}

const outlineButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
  verticalAlign: "top",
};
