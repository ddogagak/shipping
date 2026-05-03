"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Carrier = "k-packet" | "egs";

type PreviewRow = {
  row_index: number;
  carrier: Carrier;
  selected: boolean;
  original_order_number: string;
  order_suffixes: string[];
  recipient_name: string;
  country_code: string;
  tracking_number: string;
  local_tracking_number: string;
  transmission_result: string;
  next_shipping_label_status: "printed" | "uploaded" | "done";
  match_status:
    | "matched_by_order"
    | "matched_by_name"
    | "duplicate_candidate"
    | "not_found"
    | "missing_tracking";
  db_order_number: string;
  db_name: string;
  db_country_code: string;
  current_tracking_number: string;
  current_shipping_label_status: string;
  candidate_order_numbers: string[];
  candidate_orders: {
    order_number: string;
    name: string;
    country_code: string;
    shipping_method: string;
    shipping_label_status: string;
    tracking_number: string;
  }[];
};

type PreviewResult = {
  ok?: boolean;
  carrier?: Carrier;
  total?: number;
  rows?: PreviewRow[];
  error?: string;
  detail?: string;
};

type UpdateResult = {
  ok?: boolean;
  updated_count?: number;
  failed_count?: number;
  failed?: { order_number: string; error: string }[];
  error?: string;
  detail?: string;
};

const statusLabels: Record<PreviewRow["match_status"], string> = {
  matched_by_order: "주문번호 매칭",
  matched_by_name: "수취인명 매칭",
  duplicate_candidate: "후보 여러 개",
  not_found: "매칭 없음",
  missing_tracking: "운송장 없음",
};

export default function TrackingUploadPage() {
  const [carrier, setCarrier] = useState<Carrier>("k-packet");
  const [file, setFile] = useState<File | null>(null);
  const [egsText, setEgsText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows]);

  async function preview() {
    setLoading(true);
    setMessage("");
    setRows([]);

    try {
      const formData = new FormData();
      formData.append("carrier", carrier);

      if (carrier === "k-packet") {
        if (!file) {
          setMessage("K-Packet CSV 파일을 선택해 주세요.");
          return;
        }
        formData.append("file", file);
      } else {
        if (!egsText.trim()) {
          setMessage("EGS/린코스 표 내용을 붙여넣어 주세요.");
          return;
        }
        formData.append("text", egsText);
      }

      const response = await fetch("/api/ebay/tracking-preview", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as PreviewResult;

      if (!response.ok) {
        setMessage(json.detail || json.error || "미리보기 실패");
        return;
      }

      setRows(json.rows || []);
      setMessage(`미리보기 완료: ${json.rows?.length || 0}건`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function updateTracking() {
    if (!selectedCount) {
      setMessage("업데이트할 행을 선택해 주세요.");
      return;
    }

    const ok = confirm(`선택된 ${selectedCount}건의 운송장을 DB에 업데이트할까?`);
    if (!ok) return;

    setUpdating(true);
    setMessage("");

    try {
      const response = await fetch("/api/ebay/tracking-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          carrier,
          rows,
        }),
      });

      const json = (await response.json()) as UpdateResult;

      if (!response.ok) {
        setMessage(json.detail || json.error || "업데이트 실패");
        return;
      }

      setMessage(`업데이트 완료: ${json.updated_count || 0}건 / 실패 ${json.failed_count || 0}건`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setUpdating(false);
    }
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        selected:
          checked &&
          row.match_status !== "not_found" &&
          row.match_status !== "duplicate_candidate" &&
          row.match_status !== "missing_tracking",
      }))
    );
  }

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Tracking Upload</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>
              K-Packet CSV 또는 EGS/린코스 붙여넣기 자료로 운송장번호를 DB에 업데이트합니다.
            </p>
          </div>

          <Link href="/" style={linkButtonStyle}>
            메인
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={() => setCarrier("k-packet")} style={tabStyle(carrier === "k-packet")}>
            K-Packet
          </button>
          <button type="button" onClick={() => setCarrier("egs")} style={tabStyle(carrier === "egs")}>
            EGS / 린코스
          </button>
        </div>

        {carrier === "k-packet" ? (
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>K-Packet CSV 파일</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setRows([]);
                setMessage("");
              }}
            />
            <p style={helpStyle}>필수 컬럼: 고객주문번호, 등기번호, 수취인명</p>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>EGS / 린코스 표 붙여넣기</label>
            <textarea
              value={egsText}
              onChange={(event) => {
                setEgsText(event.target.value);
                setRows([]);
                setMessage("");
              }}
              placeholder={"No\\t선택\\t채널명\\t린코스송장번호\\t주문번호\\t현지송장번호\\t서비스코드\\t받는사람\\t국가코드\\t접수일자\\t출력여부\\t출력일자\\t전송결과"}
              style={{ width: "100%", minHeight: 180, border: "1px solid #d1d5db", borderRadius: 12, padding: 12 }}
            />
            <p style={helpStyle}>
              필수 컬럼: 린코스송장번호, 주문번호, 현지송장번호, 받는사람, 국가코드, 전송결과
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={preview} disabled={loading} style={primaryButtonStyle}>
            {loading ? "검토 중..." : "미리보기"}
          </button>

        </div>

        {message ? <p style={{ marginBottom: 0, color: message.includes("실패") || message.includes("오류") ? "#b91c1c" : "#374151" }}>{message}</p> : null}
      </section>

      {rows.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>미리보기 결과</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700 }}>
                <input type="checkbox" onChange={(event) => toggleAll(event.target.checked)} />
                전체 선택
              </label>
              <button type="button" onClick={updateTracking} disabled={updating || !selectedCount} style={darkButtonStyle}>
                {updating ? "업데이트 중..." : `선택 ${selectedCount}건 업데이트`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1300, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>방식</th>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>주문번호</th>
                  <th style={thStyle}>뒤5자리</th>
                  <th style={thStyle}>수취인</th>
                  <th style={thStyle}>국가</th>
                  <th style={thStyle}>운송장번호</th>
                  <th style={thStyle}>현지송장번호</th>
                  <th style={thStyle}>전송결과</th>
                  <th style={thStyle}>매칭상태</th>
                  <th style={thStyle}>DB 주문번호</th>
                  <th style={thStyle}>현재상태</th>
                  <th style={thStyle}>변경상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.row_index}-${index}`} style={{ background: row.selected ? "#f8fafc" : "#fff" }}>
                    <td style={tdStyle}>{row.carrier}</td>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => updateRow(index, { selected: event.target.checked })}
                      />
                    </td>
                    <td style={tdStyle}>{row.original_order_number}</td>
                    <td style={tdStyle}>{row.order_suffixes[0] || "-"}</td>
                    <td style={tdStyle}>{row.recipient_name}</td>
                    <td style={tdStyle}>{row.country_code}</td>
                    <td style={tdStyle}>
                      <input
                        value={row.tracking_number}
                        onChange={(event) => updateRow(index, { tracking_number: event.target.value })}
                        style={inputStyle}
                      />
                    </td>
                    <td style={tdStyle}>{row.carrier === "egs" ? (row.local_tracking_number ? "Y" : "-") : row.local_tracking_number || "-"}</td>
                    <td style={tdStyle}>{row.transmission_result || "-"}</td>
                    <td style={tdStyle}>
                      <span style={badgeStyle(row.match_status)}>{statusLabels[row.match_status]}</span>
                    </td>
                    <td style={tdStyle}>
                      <input
                        value={row.db_order_number}
                        onChange={(event) => updateRow(index, { db_order_number: event.target.value })}
                        style={inputStyle}
                        list={`candidates-${index}`}
                      />
                      <datalist id={`candidates-${index}`}>
                        {row.candidate_order_numbers.map((orderNumber) => (
                          <option key={orderNumber} value={orderNumber} />
                        ))}
                      </datalist>
                      {row.candidate_orders?.length > 1 ? (
                        <div style={candidateBoxStyle}>
                          <strong>후보 {row.candidate_orders.length}개</strong>
                          {row.candidate_orders.map((candidate) => (
                            <button
                              key={candidate.order_number}
                              type="button"
                              onClick={() => updateRow(index, { db_order_number: candidate.order_number })}
                              style={candidateButtonStyle}
                            >
                              <div><b>{candidate.order_number}</b></div>
                              <div>수취인: {candidate.name || "-"} / 국가: {candidate.country_code || "-"}</div>
                              <div>방식: {candidate.shipping_method || "-"} / 상태: {candidate.shipping_label_status || "-"}</div>
                              <div>운송장: {candidate.tracking_number || "-"}</div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{row.current_shipping_label_status || "-"}</td>
                    <td style={tdStyle}>
                      <select
                        value={row.next_shipping_label_status}
                        onChange={(event) =>
                          updateRow(index, {
                            next_shipping_label_status: event.target.value as PreviewRow["next_shipping_label_status"],
                          })
                        }
                        style={inputStyle}
                      >
                        <option value="printed">printed</option>
                        <option value="uploaded">uploaded</option>
                        <option value="done">done</option>
                      </select>
                    </td>
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 800,
  marginBottom: 8,
};

const helpStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  marginBottom: 0,
};

const linkButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#111827",
  fontWeight: 800,
};

const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const darkButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    border: "1px solid " + (active ? "#2563eb" : "#d1d5db"),
    borderRadius: 999,
    padding: "9px 14px",
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#374151",
    fontWeight: 800,
    cursor: "pointer",
  };
}

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 120,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "6px 8px",
};

function badgeStyle(status: PreviewRow["match_status"]): React.CSSProperties {
  const colorMap: Record<PreviewRow["match_status"], { bg: string; color: string }> = {
    matched_by_order: { bg: "#ecfdf5", color: "#047857" },
    matched_by_name: { bg: "#eff6ff", color: "#1d4ed8" },
    duplicate_candidate: { bg: "#fffbeb", color: "#92400e" },
    not_found: { bg: "#fef2f2", color: "#b91c1c" },
    missing_tracking: { bg: "#fef2f2", color: "#b91c1c" },
  };

  const selected = colorMap[status];

  return {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 8px",
    background: selected.bg,
    color: selected.color,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}


const candidateBoxStyle: React.CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 6,
  fontSize: 12,
};

const candidateButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "1px solid #fde68a",
  borderRadius: 10,
  padding: 8,
  background: "#fffbeb",
  cursor: "pointer",
  color: "#111827",
};
