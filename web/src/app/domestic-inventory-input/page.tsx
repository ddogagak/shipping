"use client";

import {resolveAnalysisType,typeOptions,type TypeKeywordRule} from "@/lib/item-analysis-type";
import {useTypeKeywords} from "@/lib/use-type-keywords";
import Link from "next/link";
import { calculatePricing, DEFAULT_PRICING_SETTINGS } from "@/lib/pricing";
import { useEffect, useMemo, useState } from "react";

type InventoryStatus =
  | "입고전"
  | "해외배송"
  | "입고완료"
  | "판매중"
  | "판매완료"
  | "보류";

type PreviewItem = {
  local_id: string;
  checked: boolean;
  item_name: string;
  item_type: string;
  series_name: string;
  option_seq: number;
  yen_price: number;
  shipping_fee: number;
  domestic_shipping_fee: number;
  total_price: number;
  tracking_number: string;
  image_url: string;
  lineup_image_url: string;
  source_url: string;
  currency: string;
  purchase_price: number;
  component_count: number | null;
  unit_sale_price: number;
  quantity: number;
  status: InventoryStatus;
  memo: string;
  raw_text: string;
  saved?: boolean;
};

type InputMode = "manual" | "text";

const statusList: InventoryStatus[] = [
  "입고전",
  "해외배송",
  "입고완료",
  "판매중",
  "판매완료",
  "보류",
];



const seriesList = [
  "헌터헌터",
  "귀멸의칼날",
  "나의히어로아카데미아",
  "프리렌",
  "진격의거인",
  "치이카와",
  "약사의혼잣말",
  "나루토",
  "기타",
];

const currencyList = ["JPY", "CNY", "KRW"];


const SOURCING_GPT_PROMPT = \`소싱 자료를 확인해서 ddoga.lol 소싱 등록 입력용 텍스트로 정리해줘.

[목표]
- 이 결과는 DDOGA의 /domestic-inventory-input → "텍스트 붙여넣기"에 바로 붙여넣는다.
- 실제 매입등록이 아니라 "소싱 후보/상품 정보 등록"용이다.
- 아래 출력 형식을 정확히 지키고, 형식 밖의 설명·검산·표·마크다운은 쓰지 않는다.

[자료 확인 우선순위]
1. 이번 대화에서 가장 최근에 업로드한 HTML·텍스트·스크린샷·주문내역을 최우선으로 본다.
2. 같은 상품 자료가 여러 개면 최신 자료를 기준으로 하고, 최신 자료에 없는 정보만 이전 자료로 보완한다.
3. 파일이나 HTML이 일부만 보이면 전체 내용을 확인한 뒤 정리한다.
4. 옵션 정보가 HTML/JSON 안에 있으면 skuCore / skuBase / priceVO 등 실제 옵션 구조를 확인한다.
5. 자료에 없는 상품명, 가격, 옵션번호, 구성품 수, 이미지 URL, 구매수량, 배송비, 운송장, 판매상태를 임의로 만들지 않는다.
6. 확인되지 않은 값은 추정하지 말고 빈칸으로 둔다. 숫자 0으로 임의 채우지 않는다.

[상품 분리 규칙]
- 서로 다른 상품/옵션은 반드시 각각 별도의 === ITEM === 블록으로 분리한다.
- 동일 상품이라도 옵션번호, 가격, 구성품 수, 이미지가 다르면 별도 ITEM으로 분리한다.
- 같은 상품의 수량만 여러 개 구매한 경우에는 하나의 ITEM으로 두고 QTY에 실제 구매수량을 적는다.
- OPTION_NO는 원본 사이트에서 확인되는 실제 옵션번호/순번만 적는다. 확인되지 않으면 빈칸.
- 상품명은 검색/매칭하기 쉽게 작품명·상품군·옵션 특징이 드러나는 이름으로 정리하되, 자료에 없는 캐릭터/옵션명을 만들어내지 않는다.

[가격 / 수량 / 박스 규칙]
- PRICE는 선택한 옵션 1개 또는 박스 1개의 "총 구매가"다.
- 랜덤상품/BOX 상품은 박스 전체 구매가를 PRICE에 적고, BOX_COUNT에는 그 박스의 실제 구성품 수(팩 수/개수)를 적는다.
- 예: 1박스가 20팩이고 박스 가격이 3,960엔이면 PRICE: 3960 / BOX_COUNT: 20.
- 단품은 BOX_COUNT: 1.
- QTY는 실제로 구매/주문하는 박스·세트·단품의 수량이다.
- 여러 개입 세트라도 PRICE를 임의로 개당가로 나누지 않는다.
- 통화는 JPY / CNY / KRW 중 하나만 사용한다.
- 일본/중국 현지 배송비가 자료에 명확히 있으면 DOMESTIC_SHIPPING에 숫자만 적는다. 상품별 귀속이 불명확하면 임의 배분하지 말고 빈칸.

[작품명 SERIES]
가능하면 아래 DDOGA 작품명 중 하나로 통일한다.
- 헌터헌터
- 귀멸의칼날
- 나의히어로아카데미아
- 프리렌
- 진격의거인
- 치이카와
- 약사의혼잣말
- 나루토
- 기타
정확히 어느 작품인지 확인되지 않으면 기타.

[TYPE]
- 자료상 명확한 상품 형태를 적는다.
- 예: 아크릴 / 지류 / 뱃지 / 피규어 / 키링 / 기타
- 애매하면 기타.
- DDOGA에서 상품명 기반 자동분류를 다시 적용하므로 억지로 추정하지 않는다.

[이미지 규칙]
- IMAGE와 LINEUP_IMAGE를 습관적으로 비워두지 않는다.
- 업로드 자료 안의 img src, data-src, og:image, 상품 대표이미지, 옵션 이미지, 상세 이미지 URL을 반드시 확인한다.
- IMAGE는 해당 옵션/상품의 대표이미지 URL.
- LINEUP_IMAGE는 전체 종류/캐릭터 구성/라인업을 보여주는 이미지가 있을 때 그 URL.
- 옵션별 대표 이미지가 다르면 각 ITEM의 IMAGE도 해당 옵션 이미지로 다르게 적는다.
- 이미지 URL을 확인할 수 없을 때만 빈칸.
- SOURCE_URL은 실제 원본 상품 상세페이지 URL을 적는다. 구매대행 페이지보다 원 판매처 링크가 확인되면 원 판매처 링크를 우선한다.

[상태 / 메모]
- 기본 STATUS는 입고전.
- 해외배송/입고완료/판매중/판매완료/보류가 자료에서 명확할 때만 바꾼다.
- MEMO에는 예약판매, 출시일, 구매제한, 특전, 등급/비율, 랜덤 구성, 박스 구성처럼 소싱 판단에 필요한 정보만 짧게 적는다.
- 가격 계산 결과나 추정 판매가는 MEMO에 임의로 넣지 않는다.

[출력 형식]
- 반드시 아래 형식만 반복해서 출력한다.
- 값이 없는 필드도 필드명은 유지하고 콜론 뒤를 비워둔다.
- 코드블록을 쓰지 않는다.

=== ITEM ===
NAME:
SERIES:
TYPE:
CURRENCY:
PRICE:
QTY:
BOX_COUNT:
OPTION_NO:
IMAGE:
LINEUP_IMAGE:
SOURCE_URL:
DOMESTIC_SHIPPING:
TRACKING:
STATUS: 입고전
MEMO:

[최종 검증]
- 모든 옵션이 빠짐없이 ITEM으로 분리됐는지 확인한다.
- PRICE가 개당가인지 박스 총가인지 자료 기준으로 다시 확인한다.
- BOX_COUNT가 "구매 박스 수"가 아니라 "박스 1개 안의 실제 구성품 수"인지 확인한다.
- QTY가 실제 구매수량인지 확인한다.
- IMAGE / LINEUP_IMAGE / SOURCE_URL을 자료에서 찾을 수 있는데 누락하지 않았는지 확인한다.
- 추정값을 넣지 않았는지 확인한 뒤 출력한다.\`;

const initialManualForm = {
  item_name: "",
  item_type: "기타",
  series_name: "기타",
  option_seq: 0,
  currency: "JPY",
  purchase_price: 0,
  domestic_shipping_fee: 0,
  tracking_number: "",
  image_url: "",
  lineup_image_url: "",
  source_url: "",
  component_count: 0,
  quantity: 1,
  status: "입고전" as InventoryStatus,
  memo: "",
};


/**
 * Use the exact same shared calculator and price guide as broadcast-sale inventory.
 * A missing box count must not silently get the multi-item pricing tier.
 */
function InventoryPricingOverview({
  currency,
  purchasePrice,
  componentCount,
}: {
  currency: string;
  purchasePrice: number;
  componentCount: number | null;
}) {
  const count = Number(componentCount);
  const purchase = Number(purchasePrice);
  if (!Number.isFinite(purchase) || purchase <= 0 || !Number.isInteger(count) || count <= 0) {
    return <div style={pricingBoxStyle}>구매가와 박스당 팩 수를 입력하면 통일된 판매가가 표시돼.</div>;
  }

  const pricing = calculatePricing(currency, purchase, count);
  const retention = DEFAULT_PRICING_SETTINGS.salesRetentionRate;
  const guides = [
    { label: "0% 마진 (손익분기점)", unit: Math.ceil(pricing.costPrice / retention / count), featured: false },
    { label: "기본권장 판매가", unit: pricing.unitSalePrice, featured: true },
    { label: "순수익률 15%", unit: Math.ceil(pricing.costPrice / (retention - 0.15) / count), featured: false },
    { label: "순수익률 20%", unit: Math.ceil(pricing.costPrice / (retention - 0.20) / count), featured: false },
  ];

  return (
    <div style={{ ...pricingBoxStyle, display: "block" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <span>비용포함원가 <strong>{pricing.costPrice.toLocaleString("ko-KR")}원</strong></span>
        <span>최소마진(목표이익) <strong>{pricing.targetProfit.toLocaleString("ko-KR")}원</strong></span>
        <span>개당판매가 <strong>{pricing.unitSalePrice.toLocaleString("ko-KR")}원</strong></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {guides.map(({ label, unit, featured }) => (
          <div
            key={label}
            style={{
              padding: 9,
              borderRadius: 8,
              background: featured ? "#eff6ff" : "#fff",
              border: featured ? "1px solid #2563eb" : "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ color: "#475569", fontSize: 12 }}>{label}</span>
            <strong>{unit.toLocaleString("ko-KR")}원/개</strong>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        방송판매재고와 동일 · 박스당 {count}개 기준 · 판매 수수료·부가세 16% 차감
      </div>
    </div>
  );
}

export default function DomesticInventoryInputPage() {
  const {rules,ready}=useTypeKeywords();
  const [manualTypeEdited,setManualTypeEdited]=useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [rawText, setRawText] = useState("");
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const typeList=typeOptions(rules,[manualForm.item_type,...items.map(i=>i.item_type)]);
  const suggestedType=manualTypeEdited?manualForm.item_type:resolveAnalysisType(manualForm.item_name,"기타",rules);
  const parsedItems = useMemo(() => {
    if (inputMode === "text" && ready) return parseInventoryText(rawText,rules);
    return [];
  }, [inputMode, rawText,rules,ready]);

  useEffect(() => {
    if (inputMode !== "manual") {
      setItems(parsedItems);
    }
  }, [parsedItems, inputMode]);

  const checkedCount = items.filter((item) => item.checked && !item.saved).length;


  const copySourcingPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SOURCING_GPT_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      setSaveMessage("프롬프트 복사에 실패했어. 프롬프트 영역을 직접 선택해서 복사해줘.");
    }
  };

  const updateManualForm = (
    field: keyof typeof initialManualForm,
    value: string
  ) => {
    if(field==="item_type")setManualTypeEdited(true);
    setManualForm((prev) => ({
      ...prev,
      [field]:
        field === "purchase_price" ||
        field === "component_count" ||
        field === "domestic_shipping_fee" ||
        field === "option_seq" ||
        field === "quantity"
          ? Number(value)
          : value,
    }));
  };

  const addManualItem = () => {
    setSaveMessage("");
    if(!ready)return setSaveMessage("유형 키워드를 불러오는 중이야. 잠시 후 다시 시도해줘.");

    if (!manualForm.item_name.trim()) {
      setSaveMessage("상품명을 입력해줘.");
      return;
    }

    const pricing = calculatePricing(
      manualForm.currency,
      manualForm.purchase_price,
      manualForm.component_count || null
    );

    const item: PreviewItem = {
      local_id: `manual-${Date.now()}`,
      checked: true,
      item_name: manualForm.item_name,
      item_type: suggestedType,
      series_name: manualForm.series_name,
      option_seq: manualForm.option_seq,
      currency: manualForm.currency,
      purchase_price: manualForm.purchase_price,
      yen_price: manualForm.currency === "JPY" ? manualForm.purchase_price : 0,
      shipping_fee: 0,
      domestic_shipping_fee: manualForm.domestic_shipping_fee,
      total_price: pricing.costPrice,
      tracking_number: manualForm.tracking_number,
      image_url: manualForm.image_url,
      lineup_image_url: manualForm.lineup_image_url,
      source_url: manualForm.source_url,
      component_count: manualForm.component_count || null,
      unit_sale_price: pricing.unitSalePrice,
      quantity: manualForm.quantity,
      status: manualForm.status,
      memo: manualForm.memo,
      raw_text: "manual",
      saved: false,
    };

    setItems((prev) => [item, ...prev]);
    setManualForm(initialManualForm);setManualTypeEdited(false);
    setSaveMessage("직접 입력 항목이 추가됐어. 체크한 항목 저장을 눌러 DB에 저장하면 돼.");
  };

  const updateItem = (
    localId: string,
    field: keyof PreviewItem,
    value: string | boolean
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.local_id !== localId) return item;

        if (
          field === "quantity" ||
          field === "option_seq" ||
          field === "purchase_price" ||
          field === "component_count" ||
          field === "unit_sale_price" ||
          field === "yen_price" ||
          field === "shipping_fee" ||
          field === "domestic_shipping_fee" ||
          field === "total_price"
        ) {
          const nextItem = { ...item, [field]: Number(value), saved: false };
          if (field === "purchase_price" || field === "component_count") {
            const pricing = calculatePricing(
              nextItem.currency,
              nextItem.purchase_price,
              nextItem.component_count
            );
            return {
              ...nextItem,
              total_price: pricing.costPrice,
              unit_sale_price: pricing.unitSalePrice,
            };
          }
          return nextItem;
        }

        if (field === "currency") {
          const nextItem = { ...item, currency: String(value), saved: false };
          const pricing = calculatePricing(
            nextItem.currency,
            nextItem.purchase_price,
            nextItem.component_count
          );
          return {
            ...nextItem,
            yen_price: nextItem.currency === "JPY" ? nextItem.purchase_price : 0,
            total_price: pricing.costPrice,
            unit_sale_price: pricing.unitSalePrice,
          };
        }

        return { ...item, [field]: value, saved: false };
      })
    );
  };

  const toggleAll = (checked: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, checked })));
  };


  const saveSelected = async () => {
    setSaveMessage("");
    setIsSaving(true);

    const targets = items.filter((item) => item.checked && !item.saved);
    let successCount = 0;

    try {
      for (const item of targets) {
        if (!item.item_name.trim()) {
          throw new Error("상품명이 없는 항목이 있어 저장을 중단했어.");
        }

        const pricing = calculatePricing(
          item.currency,
          item.purchase_price,
          item.component_count
        );

        const payload = {
          ...item,
          // 현재 DB 가격 컬럼이 integer라 저장 시 정수로 정규화
          purchase_price: Math.round(item.purchase_price),
          yen_price: item.currency === "JPY" ? Math.round(item.purchase_price) : 0,
          total_price: pricing.costPrice,
          unit_sale_price: pricing.unitSalePrice,
        };

        const res = await fetch("/api/domestic-inventory/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await res.json();

        if (!res.ok || !result.ok) {
          throw new Error(result.message || `저장 실패: ${res.status}`);
        }

        successCount += 1;

        setItems((prev) =>
          prev.map((prevItem) =>
            prevItem.local_id === item.local_id
              ? { ...prevItem, saved: true, checked: false }
              : prevItem
          )
        );
      }

      setSaveMessage(`${successCount}건 저장 완료`);
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? `저장 실패: ${error.message}` : "저장 실패"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={titleStyle}>소싱 등록</h1>
          <p style={subTextStyle}>
            직접 입력 / GPT 정리 텍스트로 소싱 상품을 등록합니다. 실제 매입·입고 재고는 매입관리에서 관리합니다.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={linkButtonStyle}>메인</Link>
          <Link href="/domestic-inventory-cards" style={linkButtonStyle}>소싱 카드</Link>
          <Link href="/domestic-inventory" style={linkButtonStyle}>소싱 DB</Link>
        </div>
      </div>

      <section style={inputPanelStyle}>
        <div style={modeButtonRowStyle}>
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            style={inputMode === "manual" ? activeModeButtonStyle : modeButtonStyle}
          >
            직접 입력하기
          </button>

          <button
            type="button"
            onClick={() => setInputMode("text")}
            style={inputMode === "text" ? activeModeButtonStyle : modeButtonStyle}
          >
            텍스트 붙여넣기
          </button>
        </div>

        {inputMode === "manual" ? (
          <>
            <h2 style={panelTitleStyle}>직접 입력하기</h2>

            <div style={manualGridStyle}>
              <ManualField label="상품명" value={manualForm.item_name} onChange={(v) => updateManualForm("item_name", v)} />
              <ManualSelect label="작품명" value={manualForm.series_name} options={seriesList} onChange={(v) => updateManualForm("series_name", v)} />
              <ManualSelect label="타입" value={suggestedType} options={typeList} onChange={(v) => updateManualForm("item_type", v)} />
              <ManualSelect label="상태" value={manualForm.status} options={statusList} onChange={(v) => updateManualForm("status", v)} />
              <ManualField label="수량" type="number" value={String(manualForm.quantity)} onChange={(v) => updateManualForm("quantity", v)} />
              <ManualSelect label="통화" value={manualForm.currency} options={currencyList} onChange={(v) => updateManualForm("currency", v)} />
              <ManualField label={`구매가 (${manualForm.currency})`} type="number" value={String(manualForm.purchase_price)} onChange={(v) => updateManualForm("purchase_price", v)} />
              <ManualField label="박스당 팩 수" type="number" value={String(manualForm.component_count)} onChange={(v) => updateManualForm("component_count", v)} />
              <ManualField label="일본/중국내 배송비" type="number" value={String(manualForm.domestic_shipping_fee)} onChange={(v) => updateManualForm("domestic_shipping_fee", v)} />
              <ManualField label="옵션번호" type="number" value={String(manualForm.option_seq)} onChange={(v) => updateManualForm("option_seq", v)} />
              <ManualField label="운송장" value={manualForm.tracking_number} onChange={(v) => updateManualForm("tracking_number", v)} />
              <ManualField label="대표 이미지 URL" value={manualForm.image_url} onChange={(v) => updateManualForm("image_url", v)} />
              <ManualField label="라인업 이미지 URL" value={manualForm.lineup_image_url} onChange={(v) => updateManualForm("lineup_image_url", v)} />
              <ManualField label="소싱 URL" value={manualForm.source_url} onChange={(v) => updateManualForm("source_url", v)} />
              <ManualField label="기타사항 / 등급 / 비율" value={manualForm.memo} onChange={(v) => updateManualForm("memo", v)} />
            </div>

            <InventoryPricingOverview
              currency={manualForm.currency}
              purchasePrice={manualForm.purchase_price}
              componentCount={manualForm.component_count || null}
            />

            <button type="button" onClick={addManualItem} style={saveButtonStyle}>
              입력 항목 추가
            </button>
          </>
        ) : inputMode === "text" ? (
          <>
            <details style={promptGuideStyle}>
              <summary style={promptSummaryStyle}>
                GPT 소싱 정리 프롬프트
              </summary>

              <div style={promptHeaderStyle}>
                <div>
                  <strong>현재 DDOGA 소싱 등록 형식 기준</strong>
                  <div style={promptHelpStyle}>
                    옵션별 가격 · 박스 구성수 · 이미지 · 원본 URL · 최신 자료 우선 규칙까지 포함
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void copySourcingPrompt()}
                  style={promptCopyButtonStyle}
                >
                  {promptCopied ? "복사완료 ✓" : "프롬프트 전체 복사"}
                </button>
              </div>

              <textarea
                readOnly
                value={SOURCING_GPT_PROMPT}
                onFocus={(e) => e.currentTarget.select()}
                style={promptTextareaStyle}
                aria-label="GPT 소싱 정리 프롬프트"
              />
            </details>

            <h2 style={panelTitleStyle}>소싱 등록 텍스트 붙여넣기</h2>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`=== ITEM ===
NAME:
SERIES:
TYPE:
CURRENCY: JPY / CNY / KRW
PRICE:
QTY: 1
BOX_COUNT:
IMAGE:
LINEUP_IMAGE:
SOURCE_URL:
ORDER_NO:
ORDER_DATE:
DOMESTIC_SHIPPING:
TRACKING:
STATUS: 입고전
MEMO:`}
              style={rawTextareaStyle}
            />
          </>
        ) : null}

        <div style={controlBarStyle}>
          <div style={summaryBoxStyle}>
            자동/입력 항목 <strong>{items.length}</strong>건 / 저장대상{" "}
            <strong>{checkedCount}</strong>건
          </div>

          <button type="button" onClick={() => toggleAll(true)} style={smallButtonStyle}>
            전체선택
          </button>

          <button type="button" onClick={() => toggleAll(false)} style={smallButtonStyle}>
            전체해제
          </button>

          <button
            type="button"
            onClick={saveSelected}
            disabled={isSaving || checkedCount === 0}
            style={{
              ...saveButtonStyle,
              opacity: isSaving || checkedCount === 0 ? 0.6 : 1,
              cursor: isSaving || checkedCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "저장 중..." : `체크한 항목 저장 (${checkedCount}건)`}
          </button>
        </div>

        {saveMessage ? <div style={messageStyle}>{saveMessage}</div> : null}
      </section>

      <section style={cardsSectionStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>항목을 추가하거나 주문내역을 넣으면 카드가 생성됩니다.</div>
        ) : (
          items.map((item, index) => (
            <article key={item.local_id} style={compactCardStyle}>
              <div style={checkAreaStyle}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateItem(item.local_id, "checked", e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <strong>#{index + 1}</strong>
              </div>

              <div style={thumbBoxStyle}>
                {item.image_url ? (
                  <img src={item.image_url} alt="" style={thumbStyle} />
                ) : (
                  <div style={emptyThumbStyle}>IMG</div>
                )}
              </div>

              <div style={cardMainStyle}>
                <div style={badgeRowStyle}>
                  <span style={badgeStyle}>{item.series_name}</span>
                  <span style={typeBadgeStyle}>{item.item_type}</span>
                  <span style={statusBadgeStyle}>{item.status}</span>
                  {item.saved ? <span style={savedBadgeStyle}>저장완료</span> : null}
                </div>

                <EditableField
                  label="상품명"
                  value={item.item_name}
                  onChange={(value) => updateItem(item.local_id, "item_name", value)}
                  textarea
                />

                <div style={grid4Style}>
                  <EditableSelect label="작품명" value={item.series_name} options={seriesList} onChange={(v) => updateItem(item.local_id, "series_name", v)} />
                  <EditableSelect label="타입" value={item.item_type} options={typeList} onChange={(v) => updateItem(item.local_id, "item_type", v)} />
                  <EditableSelect label="상태" value={item.status} options={statusList} onChange={(v) => updateItem(item.local_id, "status", v)} />
                  <EditableField label="수량" value={String(item.quantity)} type="number" onChange={(v) => updateItem(item.local_id, "quantity", v)} />
                </div>

                <div style={grid4Style}>
                  <EditableField label="옵션번호" value={String(item.option_seq)} type="number" onChange={(v) => updateItem(item.local_id, "option_seq", v)} />
                  <EditableSelect label="통화" value={item.currency} options={currencyList} onChange={(v) => updateItem(item.local_id, "currency", v)} />
                  <EditableField label={`구매가 (${item.currency})`} value={String(item.purchase_price)} type="number" onChange={(v) => updateItem(item.local_id, "purchase_price", v)} />
                </div>

                <InventoryPricingOverview
                  currency={item.currency}
                  purchasePrice={item.purchase_price}
                  componentCount={item.component_count}
                />

                <div style={grid4Style}>
                  <EditableField label="박스당 팩 수" value={String(item.component_count ?? "")} type="number" onChange={(v) => updateItem(item.local_id, "component_count", v)} />
                  <EditableField label="내 배송비" value={String(item.domestic_shipping_fee)} type="number" onChange={(v) => updateItem(item.local_id, "domestic_shipping_fee", v)} />
                  <EditableField label="대표 이미지 URL" value={item.image_url} onChange={(v) => updateItem(item.local_id, "image_url", v)} />
                  <EditableField label="라인업 이미지 URL" value={item.lineup_image_url} onChange={(v) => updateItem(item.local_id, "lineup_image_url", v)} />
                </div>
                <div style={grid3Style}>
                  <EditableField label="소싱 URL" value={item.source_url} onChange={(v) => updateItem(item.local_id, "source_url", v)} />
                  <EditableField label="운송장" value={item.tracking_number} onChange={(v) => updateItem(item.local_id, "tracking_number", v)} />
                  <EditableField label="기타사항 / 등급 / 비율" value={item.memo} onChange={(v) => updateItem(item.local_id, "memo", v)} />
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}


function parseInventoryText(rawText: string,rules:TypeKeywordRule[]): PreviewItem[] {
  if (!rawText.trim()) return [];

  if (rawText.includes("=== ITEM ===")) {
    return parseFixedInventoryText(rawText,rules);
  }

  return [];
}

function parseFixedInventoryText(rawText: string,rules:TypeKeywordRule[]): PreviewItem[] {
  const hasOrderBlock = rawText.includes("=== ORDER ===");
  const orderBlock = hasOrderBlock ? rawText.split("=== ITEM ===")[0] : "";

  const orderSeries = getField(orderBlock, "SERIES");
  const orderDomesticShipping = toNumber(getField(orderBlock, "DOMESTIC_SHIPPING"));
  const orderTracking = getField(orderBlock, "TRACKING");
  const orderStatus = getField(orderBlock, "STATUS") || "입고전";

  const itemBlocks = rawText
    .split("=== ITEM ===")
    .slice(1)
    .map((block) => block.trim())
    .filter(Boolean);

  return itemBlocks.map((block, index) => {
    const itemName = getField(block, "NAME");

    const itemSeries =
      getField(block, "SERIES") ||
      orderSeries ||
      detectSeriesName(itemName) ||
      "기타";

    const itemType=resolveAnalysisType(itemName,getField(block,"TYPE"),rules);

    const price = toNumber(getField(block, "PRICE"));
    const qty = toNumber(getField(block, "QTY")) || 1;
    const currency = (getField(block, "CURRENCY") || "JPY").toUpperCase();
    const boxCount = toNumber(getField(block, "BOX_COUNT"));
    const pricing = calculatePricing(currency, price, boxCount || null);

    return {
      local_id: `item-${index}-${Date.now()}`,
      checked: true,
      item_name: itemName,
      item_type: itemType,
      series_name: itemSeries,
      option_seq: toNumber(getField(block, "OPTION_NO") || getField(block, "OPTION_SEQ")),
      currency,
      purchase_price: price,
      yen_price: currency === "JPY" ? price : 0,
      shipping_fee: 0,
      domestic_shipping_fee:
        toNumber(getField(block, "DOMESTIC_SHIPPING")) || orderDomesticShipping,
      total_price: pricing.costPrice,
      tracking_number: getField(block, "TRACKING") || orderTracking,
      image_url: getField(block, "IMAGE"),
      lineup_image_url: getField(block, "LINEUP_IMAGE"),
      source_url: getField(block, "SOURCE_URL"),
      component_count: boxCount || null,
      unit_sale_price: pricing.unitSalePrice,
      quantity: qty,
      status: (getField(block, "STATUS") || orderStatus) as InventoryStatus,
      memo: getField(block, "MEMO"),
      raw_text: block,
      saved: false,
    };
  });
}

function getField(text: string, key: string) {
  const regex = new RegExp(`^${key}:[ \\t]*(.*)$`, "im");
  return text.match(regex)?.[1]?.trim() ?? "";
}

function toNumber(value: string) {
  return (
    Number(
      String(value)
        .replace(/[¥￥元,\s]/g, "")
        .replace(/CNY/gi, "")
        .replace(/JPY/gi, "")
        .replace(/KRW/gi, "")
        .replace(/원/g, "")
    ) || 0
  );
}

function detectSeriesName(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("hunter") || text.includes("HUNTER") || text.includes("ハンター") || text.includes("헌터헌터")) return "헌터헌터";
  if (lower.includes("demon slayer") || lower.includes("kimetsu") || text.includes("鬼滅") || text.includes("귀멸")) return "귀멸의칼날";
  if (lower.includes("my hero academia") || lower.includes("boku no hero") || lower.includes("mha") || text.includes("僕のヒーローアカデミア") || text.includes("ヒロアカ") || text.includes("히로아카")) return "나의히어로아카데미아";
  if (lower.includes("frieren") || text.includes("フリーレン") || text.includes("프리렌")) return "프리렌";
  if (lower.includes("attack on titan") || lower.includes("shingeki") || text.includes("進撃") || text.includes("진격")) return "진격의거인";
  if (lower.includes("chiikawa") || text.includes("ちいかわ") || text.includes("치이카와")) return "치이카와";
  if (lower.includes("the apothecary diaries") || text.includes("薬屋のひとりごと") || text.includes("약사의 혼잣말") || text.includes("약사의혼잣말") || text.includes("마오마오")) return "약사의혼잣말";
  if (lower.includes("naruto") || text.includes("ナルト") || text.includes("나루토")) return "나루토";

  return "기타";
}

function ManualField({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function ManualSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function EditableField({ label, value, onChange, type = "text", textarea = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {label}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textareaStyle} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </label>
  );
}

function EditableSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

const pageStyle: React.CSSProperties = { padding: 24, background: "#f9fafb", minHeight: "100vh" };
const topBarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800 };
const subTextStyle: React.CSSProperties = { marginTop: 6, color: "#6b7280", fontSize: 14 };
const linkButtonStyle: React.CSSProperties = { height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", textDecoration: "none", display: "inline-flex", alignItems: "center", fontSize: 14, fontWeight: 600 };
const inputPanelStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, background: "#fff", marginBottom: 18 };
const modeButtonRowStyle: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 16 };
const modeButtonStyle: React.CSSProperties = { height: 38, padding: "0 14px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800, cursor: "pointer" };
const activeModeButtonStyle: React.CSSProperties = { ...modeButtonStyle, background: "#111827", color: "#fff", border: "1px solid #111827" };
const panelTitleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 800 };
const rawTextareaStyle: React.CSSProperties = { width: "100%", minHeight: 180, padding: 12, borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, lineHeight: 1.5, resize: "vertical" };
const promptGuideStyle: React.CSSProperties = { marginBottom: 18, border: "1px solid #c7d2fe", borderRadius: 12, background: "#f8faff", overflow: "hidden" };
const promptSummaryStyle: React.CSSProperties = { padding: "12px 14px", cursor: "pointer", fontWeight: 800, color: "#312e81", background: "#eef2ff" };
const promptHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 14px 8px", flexWrap: "wrap" };
const promptHelpStyle: React.CSSProperties = { marginTop: 4, color: "#64748b", fontSize: 12, fontWeight: 500 };
const promptCopyButtonStyle: React.CSSProperties = { height: 36, padding: "0 12px", border: "none", borderRadius: 8, background: "#4f46e5", color: "#fff", fontWeight: 800, cursor: "pointer" };
const promptTextareaStyle: React.CSSProperties = { width: "calc(100% - 28px)", margin: "0 14px 14px", minHeight: 420, padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontSize: 12, lineHeight: 1.55, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" };
const fileInputStyle: React.CSSProperties = { display: "block", marginBottom: 12 };
const controlBarStyle: React.CSSProperties = { marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const summaryBoxStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "#f3f4f6", fontSize: 14 };
const smallButtonStyle: React.CSSProperties = { height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" };
const saveButtonStyle: React.CSSProperties = { height: 38, padding: "0 14px", border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 800 };
const messageStyle: React.CSSProperties = { marginTop: 10, padding: 10, borderRadius: 10, background: "#f3f4f6", fontSize: 14, fontWeight: 700 };
const cardsSectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const compactCardStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "70px 84px 1fr", gap: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, alignItems: "start" };
const checkAreaStyle: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", paddingTop: 8 };
const thumbBoxStyle: React.CSSProperties = { width: 84, height: 84 };
const thumbStyle: React.CSSProperties = { width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" };
const emptyThumbStyle: React.CSSProperties = { width: 84, height: 84, borderRadius: 10, background: "#f3f4f6", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 };
const cardMainStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const badgeRowStyle: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const badgeStyle: React.CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#eef2ff", fontSize: 12, fontWeight: 800 };
const typeBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#fef3c7" };
const statusBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#fee2e2" };
const savedBadgeStyle: React.CSSProperties = { ...badgeStyle, background: "#dcfce7" };
const grid4Style: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8 };
const grid3Style: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8 };
const manualGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 };
const pricingBoxStyle: React.CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", margin: "10px 0 14px", padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 14 };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { height: 34, padding: "0 9px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" };
const textareaStyle: React.CSSProperties = { minHeight: 48, padding: 9, borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical" };
const emptyStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 32, textAlign: "center", color: "#6b7280" };
