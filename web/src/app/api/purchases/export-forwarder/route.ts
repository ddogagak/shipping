import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractSourceProductId } from "@/lib/purchases/product-id";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type CustomsCategory = {
  name: "doll" | "figure" | "postcard" | "poster" | "toy";
  code: "110" | "480" | "80" | "515" | "108";
};

const DOLL_KEYWORDS = [
  "毛绒",
  "毛絨",
  "玩偶",
  "娃娃",
  "布偶",
];

const FIGURE_KEYWORDS = [
  "手办",
  "手辦",
  "模型",
  "人偶",
  "雕像",
  "PVC手办",
  "PVC手辦",
  "盒蛋",
];

const POSTCARD_KEYWORDS = [
  "明信片",
  "明信卡",
];

const POSTER_KEYWORDS = [
  "海报",
  "海報",
  "挂画",
  "掛畫",
];

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 통관 자동 분류
 *
 * 인형      -> doll / 110
 * 피규어    -> figure / 480
 * 엽서      -> postcard / 80
 * 포스터    -> poster / 515
 * 그 외 전부 -> toy / 108
 *
 * 아크릴, 뱃지, 키링, 카드, 스티커 등은 별도 매칭하지 않고
 * 최종 기본값 toy / 108 로 처리한다.
 */
function classifyCustomsItem(productName: string, optionText: string): CustomsCategory {
  const text = `${productName || ""} ${optionText || ""}`;

  if (containsAny(text, DOLL_KEYWORDS)) {
    return { name: "doll", code: "110" };
  }

  if (containsAny(text, FIGURE_KEYWORDS)) {
    return { name: "figure", code: "480" };
  }

  if (containsAny(text, POSTCARD_KEYWORDS)) {
    return { name: "postcard", code: "80" };
  }

  if (containsAny(text, POSTER_KEYWORDS)) {
    return { name: "poster", code: "515" };
  }

  return { name: "toy", code: "108" };
}

function setCell(
  ws: XLSX.WorkSheet,
  rowNumber: number,
  columnIndex: number,
  value: string | number
) {
  const address = XLSX.utils.encode_cell({
    r: rowNumber - 1,
    c: columnIndex,
  });

  ws[address] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    const supabase = createServiceRoleClient();

    let query = supabase
      .from("purchase_orders")
      .select("*, purchase_items(*)")
      .eq("country", "CN");

    if (ids.length > 0) {
      query = query.in("id", ids);
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    /*
     * 이미지 URL은 소싱 DB에 매칭된 이미지가 있으면 사용한다.
     * 예전 매입 데이터처럼 sourcing_inventory_id가 없는 경우도 있으므로
     * 상품 URL의 Taobao/Tmall product id로 한 번 더 매칭한다.
     */
    const { data: sourcingRows, error: sourcingError } = await supabase
      .from("inventory_items")
      .select("id, source_url, image_url");

    if (sourcingError) throw sourcingError;

    const sourcingById = new Map<string, any>();
    const sourcingByProductId = new Map<string, any>();

    for (const row of sourcingRows ?? []) {
      sourcingById.set(String(row.id), row);

      const productId = extractSourceProductId(row.source_url);
      if (productId && !sourcingByProductId.has(productId)) {
        sourcingByProductId.set(productId, row);
      }
    }

    const templatePath = path.join(
      process.cwd(),
      "public/templates/basic_upload_sample_ko.xlsx"
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(
        "배대지 템플릿이 없어. public/templates/basic_upload_sample_ko.xlsx 경로를 확인해줘."
      );
    }

    const workbook = XLSX.read(fs.readFileSync(templatePath), {
      type: "buffer",
    });

    const worksheet = workbook.Sheets["업로드"];

    if (!worksheet) {
      throw new Error("배대지 템플릿에 '업로드' 시트가 없어.");
    }

    let rowNumber = 2;

    for (const order of orders ?? []) {
      for (const item of order.purchase_items ?? []) {
        const customs = classifyCustomsItem(
          String(item.product_name || ""),
          String(item.option_text || "")
        );

        const productId =
          String(item.source_product_id || "") ||
          extractSourceProductId(item.product_url);

        const sourcing =
          (item.sourcing_inventory_id
            ? sourcingById.get(String(item.sourcing_inventory_id))
            : null) ||
          (productId ? sourcingByProductId.get(productId) : null);

        const imageUrl =
          String(item.image_url || "").trim() ||
          String(sourcing?.image_url || "").trim();

        /*
         * 배대지 업로드 양식
         *
         * A  상품명(영문)       -> 자동분류 영문명
         * B  품목분류코드      -> 자동분류 코드
         * C  색상(중국어)      -> 공란
         * D  사이즈(중국어)    -> 공란
         * E  주문번호          -> 타오바오 주문번호
         * F  단가              -> 중국 엑셀 단가(CNY)
         * G  수량              -> 중국 엑셀 수량
         * H  관리코드          -> 주문번호
         * I  상품코드          -> 중국어 상품명
         * J  포장박스수량      -> 1 고정
         * K  상품URL           -> 중국 엑셀 상품URL
         * L  이미지URL         -> 있으면 입력
         * M  쇼핑몰명          -> 10 (직접입력)
         * N  쇼핑몰명(기타)    -> 실제 상점명
         */

        const values: Array<string | number> = [
          customs.name,
          customs.code,
          "",
          "",
          String(order.order_number || ""),
          Number(item.unit_price || 0),
          Number(item.quantity || 1),
          String(order.order_number || ""),
          String(item.product_name || ""),
          1,
          String(item.product_url || ""),
          imageUrl,
          10,
          String(order.shop_name || "Taobao"),
          "",
          String(body.request_message || ""),
          "",
          "",
          "",
          String(body.recipient_name || ""),
          String(body.recipient_english_name || ""),
          String(body.phone || ""),
          String(body.customs_id || ""),
          String(body.postal_code || ""),
          String(body.address || ""),
          String(body.address_detail || ""),
          String(body.delivery_note || ""),
          body.auto_delivery ? "Y" : "",
          body.auto_payment ? "Y" : "",
          String(body.business_alert || ""),
          Number(body.inspection ?? 1),
          Number(body.packing ?? 1),
        ];

        values.forEach((value, columnIndex) => {
          setCell(worksheet, rowNumber, columnIndex, value);
        });

        rowNumber += 1;
      }
    }

    worksheet["!ref"] = `A1:AF${Math.max(1, rowNumber - 1)}`;

    const output = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    return new NextResponse(output, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          "attachment; filename=purchase_forwarder_upload.xlsx",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "엑셀 생성 실패",
      },
      { status: 500 }
    );
  }
}
