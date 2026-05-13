"use client";

import { useState } from "react";

type FormState = {
  nickname: string;
  recipient_name: string;
  phone: string;
  postal_code: string;
  address: string;
  item_summary: string;
  memo: string;
};

const initialForm: FormState = {
  nickname: "",
  recipient_name: "",
  phone: "",
  postal_code: "",
  address: "",
  item_summary: "",
  memo: "",
};

export default function PublicRequestPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedOrderId, setSavedOrderId] = useState("");

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setMessage("");
  };

  const copyOrderId = async () => {
    if (!savedOrderId) return;

    try {
      await navigator.clipboard.writeText(savedOrderId);
      setMessage("접수번호가 복사되었습니다.");
    } catch {
      setMessage("복사에 실패했습니다. 접수번호를 직접 선택해서 복사해주세요.");
    }
  };

  const submitRequest = async () => {
    setMessage("");
    setSavedOrderId("");

    if (!form.nickname.trim()) {
      setMessage("닉네임을 입력해주세요.");
      return;
    }

    if (!form.recipient_name.trim()) {
      setMessage("수취인명을 입력해주세요.");
      return;
    }

    if (!form.phone.trim()) {
      setMessage("전화번호를 입력해주세요.");
      return;
    }

    if (!form.postal_code.trim()) {
      setMessage("우편번호를 입력해주세요.");
      return;
    }

    if (!form.address.trim()) {
      setMessage("주소를 입력해주세요.");
      return;
    }

    if (!form.item_summary.trim()) {
      setMessage("신청 물품을 입력해주세요.");
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/public-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.message || "신청 저장에 실패했습니다.");
      }

      setSavedOrderId(result.order_id ?? "");
      setMessage("신청이 완료되었습니다.");
      setForm(initialForm);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "신청 저장에 실패했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>상품 신청</h1>
          <p style={descStyle}>
            아래 정보를 입력하면 신청 내역이 접수됩니다.
          </p>
        </div>

        <div style={formStyle}>
          <Field
            label="닉네임"
            required
            value={form.nickname}
            placeholder="밴드닉네임을 입력해주세요."
            onChange={(value) => updateForm("nickname", value)}
          />

          <Field
            label="수취인명"
            required
            value={form.recipient_name}
            placeholder="택배 받을 이름"
            onChange={(value) => updateForm("recipient_name", value)}
          />

          <Field
            label="전화번호"
            required
            value={form.phone}
            placeholder="010-0000-0000"
            onChange={(value) => updateForm("phone", value)}
          />

          <Field
            label="우편번호"
            required
            value={form.postal_code}
            placeholder="12345"
            onChange={(value) => updateForm("postal_code", value)}
          />

          <div>
            <Field
              label="주소"
              required
              value={form.address}
              placeholder="기본주소 + 상세주소"
              onChange={(value) => updateForm("address", value)}
              textarea
            />

            <p style={addressGuideStyle}>
              기본주소+상세주소를 정확하게 입력해주세요. 전산으로 바로
              처리되기 때문에 주소 오기재로 인한 문제 발생 시 책임지지
              않습니다.
            </p>
          </div>

          <Field
            label="신청 물품"
            required
            value={form.item_summary}
            placeholder="신청할 물품명을 입력해주세요."
            onChange={(value) => updateForm("item_summary", value)}
            textarea
          />

          <Field
            label="메모"
            value={form.memo}
            placeholder="요청사항이 있으면 입력해주세요."
            onChange={(value) => updateForm("memo", value)}
            textarea
          />

          <button
            type="button"
            onClick={submitRequest}
            disabled={isSaving}
            style={{
              ...submitButtonStyle,
              opacity: isSaving ? 0.6 : 1,
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "신청 중..." : "신청하기"}
          </button>

          {message ? (
            <div style={messageStyle}>
              <strong>{message}</strong>

              {savedOrderId ? (
                <div style={orderIdBoxStyle}>
                  <div style={orderIdRowStyle}>
                    <span style={orderIdStyle}>접수번호: {savedOrderId}</span>

                    <button
                      type="button"
                      onClick={copyOrderId}
                      style={copyButtonStyle}
                    >
                      복사
                    </button>
                  </div>

                  <p style={guideTextStyle}>
                    본인확인을 위해 해당 접수 번호를 복사해서 배송안내
                    페이지에 댓글로 붙여넣기 부탁드립니다.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>
        {label}
        {required ? <span style={requiredStyle}> *</span> : null}
      </span>

      {textarea ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={textareaStyle}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f9fafb",
  padding: 20,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 620,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 24,
  marginTop: 28,
};

const headerStyle: React.CSSProperties = {
  marginBottom: 22,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 900,
};

const descStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#6b7280",
  lineHeight: 1.5,
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
};

const requiredStyle: React.CSSProperties = {
  color: "#ef4444",
};

const inputStyle: React.CSSProperties = {
  height: 44,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 15,
};

const textareaStyle: React.CSSProperties = {
  minHeight: 88,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  resize: "vertical",
  lineHeight: 1.5,
};

const addressGuideStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#dc2626",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 700,
};

const submitButtonStyle: React.CSSProperties = {
  height: 48,
  border: "none",
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
};

const messageStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "#f3f4f6",
  color: "#111827",
  lineHeight: 1.5,
};

const orderIdBoxStyle: React.CSSProperties = {
  marginTop: 8,
};

const orderIdRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const orderIdStyle: React.CSSProperties = {
  color: "#4b5563",
  fontWeight: 800,
};

const copyButtonStyle: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #93c5fd",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const guideTextStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#2563eb",
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 700,
};
