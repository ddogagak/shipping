[domestic-inventory-input/page.tsx 수정]

1) PreviewItem 타입 추가
currency: string;
purchase_price: number;
source_url: string;
lineup_image_url: string;
component_count: number | null;

2) initialManualForm 추가
currency: "JPY",
purchase_price: 0,
source_url: "",
lineup_image_url: "",
component_count: 0,

3) 통화 목록 추가
const currencyList = ["JPY", "CNY"];

4) 직접입력 UI 추가/교체
- 기존 총액(¥) -> 구매가 + 통화
- 박스당 팩 수(component_count)
- 소싱 URL
- 라인업 이미지 URL
- 메모 라벨을 "기타사항 / 등급 / 비율"로 변경

예시:
<ManualSelect label="통화" value={manualForm.currency} options={currencyList} onChange={(v) => updateManualForm("currency", v)} />
<ManualField label={`구매가 (${manualForm.currency})`} type="number" value={String(manualForm.purchase_price)} onChange={(v) => updateManualForm("purchase_price", v)} />
<ManualField label="박스당 팩 수" type="number" value={String(manualForm.component_count)} onChange={(v) => updateManualForm("component_count", v)} />
<ManualField label="소싱 URL" value={manualForm.source_url} onChange={(v) => updateManualForm("source_url", v)} />
<ManualField label="라인업 이미지 URL" value={manualForm.lineup_image_url} onChange={(v) => updateManualForm("lineup_image_url", v)} />

5) addManualItem()에 추가
currency: manualForm.currency,
purchase_price: manualForm.purchase_price,
source_url: manualForm.source_url,
lineup_image_url: manualForm.lineup_image_url,
component_count: manualForm.component_count || null,
yen_price: manualForm.currency === "JPY" ? manualForm.purchase_price : 0,
total_price: manualForm.purchase_price,

6) updateManualForm / updateItem 숫자 처리 조건에 추가
purchase_price
component_count

7) 텍스트 placeholder 교체
=== ITEM ===
NAME:
SERIES:
TYPE:
CURRENCY: JPY
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
MEMO:

8) parseFixedInventoryText() 안 item return에 추가
const currency = (getField(block, "CURRENCY") || "JPY").toUpperCase();
const purchasePrice = toNumber(getField(block, "PRICE"));
const boxCount = toNumber(getField(block, "BOX_COUNT"));

그리고 return 객체에:
currency,
purchase_price: purchasePrice,
yen_price: currency === "JPY" ? purchasePrice : 0,
total_price: purchasePrice,
lineup_image_url: getField(block, "LINEUP_IMAGE"),
source_url: getField(block, "SOURCE_URL"),
component_count: boxCount || null,

9) toNumber 교체
function toNumber(value: string) {
  return (
    Number(
      String(value)
        .replace(/[¥￥元,\s]/g, "")
        .replace(/CNY/gi, "")
        .replace(/JPY/gi, "")
    ) || 0
  );
}
