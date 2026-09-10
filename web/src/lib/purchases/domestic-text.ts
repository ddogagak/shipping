export type DomesticPurchaseItem = {
  product_name: string; display_name_ko: string; series_name: string; item_type: string;
  option_text: string; unit_price: number; quantity: number; line_total: number;
  component_count: number | null; product_url: string; image_url: string;
  lineup_image_url: string; memo: string;
};

export type DomesticPurchase = {
  supplier: string; purchased_at: string; invoice_number: string;
  local_shipping: number; memo: string; items: DomesticPurchaseItem[];
};

function field(text:string,key:string){return text.match(new RegExp(`^${key}:[ \\t]*(.*)$`,"im"))?.[1]?.trim()??"";}
function number(value:string){const parsed=Number(String(value||"").replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:0;}

export function parseDomesticPurchaseText(text:string):DomesticPurchase{
  if(!text.includes("=== ITEM ==="))throw new Error("=== ITEM === 구분이 없어. GPT 출력 양식을 그대로 붙여넣어줘.");
  const header=text.split("=== ITEM ===")[0],supplier=field(header,"SUPPLIER"),purchasedAt=field(header,"PURCHASE_DATE"),invoiceNumber=field(header,"INVOICE_NO");
  if(!supplier)throw new Error("SUPPLIER(거래처명)이 없어.");
  const items=text.split("=== ITEM ===").slice(1).map(block=>block.trim()).filter(Boolean).map(block=>{
    const name=field(block,"NAME");if(!name)throw new Error("NAME(상품명)이 없는 상품이 있어.");
    const quantity=Math.max(1,Math.trunc(number(field(block,"QTY"))||1)),unitPrice=Math.max(0,Math.round(number(field(block,"UNIT_PRICE")))),componentCount=Math.max(0,Math.trunc(number(field(block,"BOX_COUNT"))));
    return{product_name:name,display_name_ko:name,series_name:field(block,"SERIES")||"기타",item_type:field(block,"TYPE")||"기타",option_text:field(block,"OPTION"),unit_price:unitPrice,quantity,line_total:unitPrice*quantity,component_count:componentCount||null,product_url:field(block,"PRODUCT_URL"),image_url:field(block,"IMAGE"),lineup_image_url:field(block,"LINEUP_IMAGE"),memo:field(block,"MEMO")};
  });
  if(!items.length)throw new Error("저장할 상품이 없어.");
  return{supplier,purchased_at:purchasedAt||new Date().toISOString().slice(0,10),invoice_number:invoiceNumber,local_shipping:Math.max(0,Math.round(number(field(header,"LOCAL_SHIPPING")))),memo:field(header,"MEMO"),items};
}
