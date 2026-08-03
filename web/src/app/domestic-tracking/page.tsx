"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import * as XLSX from "xlsx";

type TrackingPreviewRow = {
  id: string;
  selected: boolean;
  phone: string;
  file_recipient_name: string;
  tracking_number: string;
  final_product_status: string;
  matched_order_id?: string;
  customer_order_no?: string;
  nickname?: string;
  recipient_name?: string;
  db_phone?: string;
  postal_code?: string;
  address?: string;
  first_order_date?: string;
  current_order_status?: string;
  current_shipping_status?: string;
  current_shipping_type?: string;
  existing_tracking_number?: string;
  match_status: string;
  tracking_comparison?: "new" | "same" | "changed" | "unmatched";
  already_done?: boolean;
  recipient_name_mismatch?: boolean;
  phone_candidate_count?: number;
  can_save?: boolean;
  next_shipping_status: string;
  next_order_status: string;
};

type PreviewResponse = {
  ok: boolean;
  rows: TrackingPreviewRow[];
  total: number;
  matched_count: number;
  complete_count: number;
  unmatched_count: number;
};

type SaveResponse = {
  ok: boolean;
  requested: number;
  updated: number;
  completed: number;
  uploaded: number;
  skipped: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return text(value).replace(/\s/g, "");
}

function cleanTrackingNumber(value: unknown) {
  return text(value).replace(/^'+/, "");
}

function isCompleteStatus(value: unknown) {
  const normalized = text(value).replace(/\s/g, "");
  return normalized.includes("배송출발") || normalized.includes("배송완료") || normalized.includes("집화처리");
}

function findHeaderIndex(headers: unknown[], names: string[]) {
  const targets = names.map((name) => normalizeHeader(name));
  return headers.findIndex((header) => targets.includes(normalizeHeader(header)));
}

function valueAt(row: unknown[], index: number) {
  if (index < 0) return "";
  return text(row[index]);
}

function makeId(index: number) {
  return `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function matchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    matched_by_phone: "전화번호 매칭",
    matched_by_masked_phone: "마스킹 번호 매칭",
    duplicate_phone: "전화번호 중복",
    duplicate_masked_phone: "마스킹 번호 중복",
    missing_phone: "전화번호 없음",
    missing_tracking: "운송장 없음",
    not_found: "전화번호 미매칭",
  };
  return labels[status] || status || "-";
}

function statusText(row: TrackingPreviewRow) {
  if (!row.matched_order_id) return "저장불가";
  if (row.already_done) return "이미 완료";
  if (isCompleteStatus(row.final_product_status)) return "배송완료 + 주문완료";
  return `${row.current_shipping_status || "start"} → ${row.next_shipping_status || "uploaded"}`;
}

function orderStatusLabel(value?: string) {
  const labels: Record<string, string> = {
    accepted: "입력됨",
    checked: "재고확인",
    kept: "킵",
    packaged: "포장완료",
    done: "완료",
  };
  return labels[value || ""] || value || "-";
}

function shippingStatusLabel(value?: string) {
  const labels: Record<string, string> = {
    start: "시작",
    excel_exported: "엑셀 추출",
    uploaded: "운송장 입력",
    registered: "운송장등록",
    done: "배송완료",
  };
  return labels[value || ""] || value || "-";
}

function trackingResultLabel(row: TrackingPreviewRow) {
  if (!row.matched_order_id) return "미매칭";
  if (row.already_done) return "완료 건 - 저장 제외";
  if (row.tracking_comparison === "same") return "기존과 동일";
  if (row.tracking_comparison === "changed") return "운송장 변경";
  return "신규 운송장";
}

export default function DomesticTrackingPage() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<TrackingPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<PreviewResponse | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResponse | null>(null);

  const selectedCount = rows.filter((row) => row.selected).length;
  const matchedCount = rows.filter((row) => row.matched_order_id).length;
  const completeCount = rows.filter((row) => row.matched_order_id && isCompleteStatus(row.final_product_status)).length;

  async function parseAndPreview(file: File) {
    setLoading(true);
    setMessage("");
    setRows([]);
    setSummary(null);
    setSaveResult(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      const headerRowIndex = rawRows.findIndex((row) =>
        row.some((cell) => normalizeHeader(cell) === "운송장번호")
      );

      if (headerRowIndex < 0) {
        setMessage("운송장번호 컬럼을 찾을 수 없어.");
        return;
      }

      const headers = rawRows[headerRowIndex];
      const trackingIndex = findHeaderIndex(headers, ["운송장번호"]);
      const phoneIndex = findHeaderIndex(headers, [
        "핸드폰번호",
        "휴대폰번호",
        "전화번호",
        "수하인전화번호",
        "받는분전화번호",
        "받는사람전화번호",
        "받는분연락처",
        "받는사람연락처",
        "수취인연락처",
      ]);
      const recipientNameIndex = findHeaderIndex(headers, [
        "받는분성함",
        "받는분성명",
        "받는사람성함",
        "받는사람성명",
        "수취인",
        "수취인명",
        "수하인",
        "수하인명",
      ]);
      const finalStatusIndex = findHeaderIndex(headers, ["최종상품상태"]);
      const fallbackFinalStatusIndex = 17; // 엑셀 기준 R열

      if (trackingIndex < 0 || phoneIndex < 0) {
        setMessage("운송장번호 또는 받는분연락처(전화번호) 컬럼을 찾을 수 없어.");
        return;
      }

      const parsedRows = rawRows
        .slice(headerRowIndex + 1)
        .map((row, index) => {
          const finalStatus =
            finalStatusIndex >= 0
              ? valueAt(row, finalStatusIndex)
              : valueAt(row, fallbackFinalStatusIndex);

          return {
            id: makeId(index),
            selected: true,
            phone: valueAt(row, phoneIndex),
            file_recipient_name: valueAt(row, recipientNameIndex),
            tracking_number: cleanTrackingNumber(valueAt(row, trackingIndex)),
            final_product_status: finalStatus,
          };
        })
        .filter((row) => row.phone || row.tracking_number);

      if (!parsedRows.length) {
        setMessage("미리보기할 운송장 데이터가 없어.");
        return;
      }

      const res = await fetch("/api/domestic/tracking/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.detail || json.error || "미리보기 실패");
        return;
      }

      const previewRows: TrackingPreviewRow[] = (json.rows || []).map((row: TrackingPreviewRow) => ({
        ...row,
        selected: Boolean(row.can_save),
      }));

      setRows(previewRows);
      setSummary(json);
      setMessage("미리보기 완료. 저장할 건만 체크하고 필요하면 입력칸에서 수정해.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id: string, patch: Partial<TrackingPreviewRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        selected: checked && Boolean(row.can_save),
      }))
    );
  }

  async function saveSelected() {
    const selectedRows = rows.filter((row) => row.selected);
    if (!selectedRows.length) {
      alert("저장할 행을 선택해줘.");
      return;
    }

    setSaving(true);
    setMessage("");
    setSaveResult(null);

    try {
      const res = await fetch("/api/domestic/tracking/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: selectedRows }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.detail || json.error || "저장 실패");
        return;
      }

      setSaveResult(json);
      setMessage(`선택 ${json.updated}건 저장 완료!`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={topBarStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Domestic Tracking Upload</h1>
          <p style={{ color: "#6b7280", margin: "6px 0 0" }}>
            운송장 파일의 전화번호만으로 주문을 매칭합니다. 수취인 이름이 다르면 경고만 표시하고, 매칭에는 사용하지 않습니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/" style={navButtonStyle}>
            홈으로
          </Link>
          <Link href="/domestic-orders" style={navButtonStyle}>
            주문상태
          </Link>
        </div>
      </div>

      <section style={cardStyle}>
        <label style={uploadBoxStyle}>
          <strong>운송장 엑셀 업로드</strong>
          <span style={{ color: "#6b7280", marginTop: 6 }}>
            .xlsx / .xls 파일 선택 → 미리보기 → 선택 저장
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            disabled={loading || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void parseAndPreview(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        {fileName ? (
          <p style={{ marginTop: 12 }}>
            선택 파일: <strong>{fileName}</strong>
          </p>
        ) : null}

        {loading ? <p>파일 분석 및 매칭 중...</p> : null}
        {saving ? <p>선택한 행 저장 중...</p> : null}

        {message ? (
          <p style={{ color: message.includes("실패") || message.includes("없") ? "#b91c1c" : "#059669", fontWeight: 800 }}>
            {message}
          </p>
        ) : null}
      </section>

      {rows.length ? (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <div style={actionBarStyle}>
            <div style={summaryGridStyle}>
              <Summary label="전체" value={summary?.total ?? rows.length} />
              <Summary label="매칭" value={summary?.matched_count ?? matchedCount} />
              <Summary label="완료예정" value={summary?.complete_count ?? completeCount} />
              <Summary label="선택" value={selectedCount} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => toggleAll(true)} style={smallButtonStyle}>
                전체선택
              </button>
              <button type="button" onClick={() => toggleAll(false)} style={smallButtonStyle}>
                전체해제
              </button>
              <button type="button" onClick={saveSelected} disabled={saving} style={saveButtonStyle}>
                선택 {selectedCount}건 DB 저장
              </button>
            </div>
          </div>

          {saveResult ? (
            <div style={resultBoxStyle}>
              저장 {saveResult.updated}건 / 배송완료 {saveResult.completed}건 / 운송장 입력 {saveResult.uploaded}건 / 스킵 {saveResult.skipped}건
            </div>
          ) : null}

          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>선택</th>
                  <th style={thStyle}>매칭상태</th>
                  <th style={thStyle}>DB 주문번호</th>
                  <th style={thStyle}>닉네임</th>
                  <th style={thStyle}>수취인 비교</th>
                  <th style={thStyle}>현재 주문상태</th>
                  <th style={thStyle}>현재 배송상태</th>
                  <th style={thStyle}>배송수단</th>
                  <th style={thStyle}>기존 운송장</th>
                  <th style={thStyle}>파일 운송장</th>
                  <th style={thStyle}>비교 결과</th>
                  <th style={thStyle}>업로드 후</th>
                  <th style={thStyle}>파일 전화번호</th>
                                    <th style={thStyle}>최종상품상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canSave = Boolean(row.can_save);
                  const rowStyle = row.already_done
                    ? completedRowStyle
                    : !canSave
                      ? warningRowStyle
                      : row.tracking_comparison === "changed"
                        ? changedRowStyle
                        : undefined;

                  return (
                    <tr key={row.id} style={rowStyle}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={!canSave}
                          onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div>{matchStatusLabel(row.match_status)}</div>
                        {row.phone_candidate_count && row.phone_candidate_count > 1 ? (
                          <div style={nameWarningStyle}>후보 {row.phone_candidate_count}건</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800 }}>{row.customer_order_no || row.matched_order_id || "-"}</div>
                        {row.matched_order_id ? <div style={subTextStyle}>{row.matched_order_id}</div> : null}
                      </td>
                      <td style={tdStyle}>{row.nickname || "-"}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800 }}>DB: {row.recipient_name || "-"}</div>
                        <div style={subTextStyle}>파일: {row.file_recipient_name || "-"}</div>
                        {row.db_phone ? <div style={subTextStyle}>DB 번호: {row.db_phone}</div> : null}
                        {row.recipient_name_mismatch ? (
                          <div style={nameWarningStyle}>⚠ 수취인 이름 다름</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(row.current_order_status === "done")}>
                          {orderStatusLabel(row.current_order_status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(row.current_shipping_status === "done")}>
                          {shippingStatusLabel(row.current_shipping_status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{row.current_shipping_type || "-"}</td>
                      <td style={tdStyle}><strong>{row.existing_tracking_number || "-"}</strong></td>
                      <td style={tdStyle}>
                        <input
                          value={row.tracking_number}
                          onChange={(event) => updateRow(row.id, { tracking_number: cleanTrackingNumber(event.target.value) })}
                          style={trackingInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={comparisonBadgeStyle(row.tracking_comparison, row.already_done)}>
                          {trackingResultLabel(row)}
                        </span>
                      </td>
                      <td style={tdStyle}>{statusText(row)}</td>
                      <td style={tdStyle}>{row.phone || "-"}</td>
                      <td style={tdStyle}>{row.final_product_status || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  );
}

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 16,
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
};

const navButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "9px 14px",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 800,
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
};

const actionBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(90px, 1fr))",
  gap: 8,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  minWidth: 80,
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "9px 12px",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const saveButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const resultBoxStyle: CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#047857",
  fontWeight: 800,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  minWidth: 1900,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "8px",
  verticalAlign: "middle",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 130,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "7px 8px",
  fontSize: 13,
};

const warningRowStyle: CSSProperties = {
  background: "#fff7ed",
};


const subTextStyle: CSSProperties = {
  marginTop: 3,
  color: "#6b7280",
  fontSize: 11,
};

const trackingInputStyle: CSSProperties = {
  width: 140,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "7px 8px",
  fontSize: 13,
  fontWeight: 800,
};

function statusBadgeStyle(done: boolean): CSSProperties {
  return {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 8px",
    background: done ? "#e5e7eb" : "#eff6ff",
    color: done ? "#4b5563" : "#1d4ed8",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

function comparisonBadgeStyle(
  comparison?: TrackingPreviewRow["tracking_comparison"],
  alreadyDone?: boolean
): CSSProperties {
  let background = "#ecfdf5";
  let color = "#047857";

  if (alreadyDone) {
    background = "#e5e7eb";
    color = "#4b5563";
  } else if (comparison === "changed") {
    background = "#fef3c7";
    color = "#92400e";
  } else if (comparison === "same") {
    background = "#dbeafe";
    color = "#1d4ed8";
  } else if (comparison === "unmatched") {
    background = "#fee2e2";
    color = "#b91c1c";
  }

  return {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 8px",
    background,
    color,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
}

const completedRowStyle: CSSProperties = {
  background: "#f3f4f6",
  color: "#6b7280",
};

const changedRowStyle: CSSProperties = {
  background: "#fffbeb",
};

const nameWarningStyle: CSSProperties = {
  marginTop: 4,
  color: "#b45309",
  fontSize: 11,
  fontWeight: 900,
};
