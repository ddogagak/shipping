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
            placeholder="예: ddong"
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

          <Field
            label="주소"
            required
            value={form.address}
            placeholder="기본주소 + 상세주소를 함께 입력해주세요."
            onChange={(value) => updateForm("address", value)}
            textarea
          />

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
                <p style={orderIdStyle}>접수번호: {savedOrderId}</p>
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

const orderIdStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#4b5563",
};
