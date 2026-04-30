import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExportRequestBody = {
  order_numbers?: string[];
};

type EbayShippingExportRow = {
  order_number: string;
  shipping_method: string | null;
  shipping_label_status: string | null;
  export_data: Record<string, unknown> | null;
};

const OUTPUT_HEADERS = [
  "★상품구분",
  "★수취인명",
  "수취인EMAIL",
  "수취인전화국가번호(숫자4자리)",
  "수취인전화지역번호(숫자4자리)",
  "수취인전화전화번호(숫자4자리)",
  "수취인전화국번(숫자4자리)",
  "★14전화번호",
  "★16국가코드",
  "★16국가명",
  "★15우편번호",
  "★13상세주소",
  "★12시/군/구",
  "★11주/도/시",
  "수취인 건물명미국행 k-packet 이용할 경우만 입력가능( 영문 공백포함 90자 이내 )",
  "★총중량",
  "★내용품",
  "★개수",
  "★순중량(g)[ = 품목 1종의 개당중량 * 개수 ](수출우편물 정보관세청 제공 동의시 필수)",
  "★가격",
  "단위",
  "HSCODE(숫자만 10자리)",
  "생산지",
  "규격(모델명)",
  "보험가입여부(Y/N)(미선택시공백가능, 음식물, 전자제품 불가)",
  "보험가입금액(물품가액을 기입 원\\)",
  "EMS : EEMS 프리미엄 : PK-Packet : K등기소형 :R",
  "EMS 비서류 : em,     EMS 서류 : ee, K-Packet : rl, 소형포장물 : re",
  "고객주문번호( 숫자,영문 30자이내)",
  "주문인우편번호(숫자6자리)",
  "주문인주소( 영문 140자이내 공백포함)",
  "주문인명( 영문 35자이내 공백포함)",
  "주문인전화국가번호(숫자4자리)",
  "주문인전화지역번호(숫자4자리)",
  "주문인전화국번호(숫자4자리)",
  "주문인전화뒷번호(숫자4자리)",
  "주문인 전화 전체번호국가번호-지역번호-국번-전화번호( 숫자, - 허용)ex. 86-062-678-1234",
  "주문인휴대전화지역번호(숫자3자리)",
  "주문인휴대전화뒷번호(숫자4자리)",
  "주문인휴대전화국번호(숫자4자리)",
  "주문인EMAIL( 영문 40자이내)",
  "주문인 휴대전화 전체지역번호-국번-뒷번호(숫자, - 허용) ex. 010-1234-5678",
  "수출우편물 정보 관세청 제공 여부(Y/N)",
  "사업자번호(숫자10자리)",
  "수출화주이름 또는 상호(수출우편물 정보관세청 제공 동의시 필수)",
  "수출화주 주소(수출우편물 정보관세청 제공 동의시 필수)",
  "수출이행등록여부(Y/N)",
  "수출신고번호1(14~15자리)",
  "전량분할발송여부(Y:전량,N:분할)",
  "선기적포장개수",
  "수출신고번호2(14~15자리)",
  "전량분할발송여부(Y:전량,N:분할) 1",
  "선기적포장개수 1",
  "수출신고번호3(14~15자리)",
  "전량분할발송여부(Y:전량,N:분할) 3",
  "선기적포장개수 3",
  "수출신고번호4(14~15자리)",
  "선기적포장개수 2",
  "전량분할발송여부(Y:전량,N:분할) 2",
  "추천우체국코드(POSA만 사용)5자리숫자",
  "수출면장여부(Y/N)",
  "★브라질세금식별번호(* 브라질행 EMS, K-Packet의 경우 필수 입력)",
  "가로(cm)",
  "세로(cm)",
  "높이(cm)",
  "부피중량 적용 제외 여부(Y/N)",
  "★IOSS/EORI/TAX NUMBER식별 번호",
  "상태",
  "물품",
  "생성 일시",
];

function cleanOrderNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
}

function cellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function todayFileDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportRequestBody;
    const orderNumbers = cleanOrderNumbers(body.order_numbers);

    if (!orderNumbers.length) {
      return NextResponse.json(
        { error: "엑셀 추출할 주문번호가 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("ebay_shipping")
      .select("order_number, shipping_method, shipping_label_status, export_data")
      .in("order_number", orderNumbers);

    if (error) {
      return NextResponse.json(
        { error: "배송 데이터 조회 실패", detail: error.message },
        { status: 500 }
      );
    }

    const rows = ((data || []) as EbayShippingExportRow[]).filter(
      (row) => row.shipping_method === "k-packet"
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "선택한 주문 중 K-Packet 추출 대상이 없습니다." },
        { status: 400 }
      );
    }

    const rowMap = new Map(rows.map((row) => [row.order_number, row]));

    const orderedRows = orderNumbers
      .map((orderNumber) => rowMap.get(orderNumber))
      .filter(Boolean) as EbayShippingExportRow[];

    const sheetData = [
      OUTPUT_HEADERS,
      ...orderedRows.map((row) => {
        const exportData = row.export_data || {};

        return OUTPUT_HEADERS.map((header) => {
          return cellValue(exportData[header]);
        });
      }),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    worksheet["!cols"] = OUTPUT_HEADERS.map((header) => ({
      wch: Math.min(Math.max(header.length + 2, 12), 36),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "K-Packet");

    const workbookArray = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;

    const exportedOrderNumbers = orderedRows.map((row) => row.order_number);

    const { error: updateError } = await supabase
      .from("ebay_shipping")
      .update({ shipping_label_status: "exported" })
      .in("order_number", exportedOrderNumbers);

    if (updateError) {
      return NextResponse.json(
        {
          error: "엑셀은 생성됐지만 라벨상태 업데이트 실패",
          detail: updateError.message,
        },
        { status: 500 }
      );
    }

    const filename = `kpacket_export_${todayFileDate()}.xlsx`;

    return new NextResponse(workbookArray, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "K-Packet 엑셀 추출 중 오류",
        detail: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
