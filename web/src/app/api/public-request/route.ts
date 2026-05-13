import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

function makeKujiOrderId(nickname: string) {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  const safeNickname = nickname
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9가-힣]/g, "");

  return `K${safeNickname}${yyyy}${mm}${dd}${hh}${mi}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const nickname = String(body.nickname ?? "").trim();
    const recipientName = String(body.recipient_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const postalCode = String(body.postal_code ?? "").trim();
    const address = String(body.address ?? "").trim();
    const itemSummary = String(body.item_summary ?? "").trim();
    const memo = String(body.memo ?? "").trim();

    if (!nickname) {
      return NextResponse.json(
        {
          ok: false,
          message: "닉네임을 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!recipientName) {
      return NextResponse.json(
        {
          ok: false,
          message: "수취인명을 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          ok: false,
          message: "전화번호를 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!postalCode) {
      return NextResponse.json(
        {
          ok: false,
          message: "우편번호를 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!address) {
      return NextResponse.json(
        {
          ok: false,
          message: "주소를 입력해주세요.",
        },
        { status: 400 }
      );
    }

    if (!itemSummary) {
      return NextResponse.json(
        {
          ok: false,
          message: "신청 물품을 입력해주세요.",
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const orderId = makeKujiOrderId(nickname);

    const today = new Date().toISOString().slice(0, 10);

    const { error: orderError } = await supabase
      .from("domestic_order")
      .insert({
        order_id: orderId,
        platform: "Kuji",

        source_order_dates: [today],
        first_order_date: today,

        nickname,
        recipient_name: recipientName,

        phone,
        postal_code: postalCode,
        address,

        order_count: 1,
        item_total_price: 0,

        order_status: "신청완료",

        item_summary: itemSummary,

        customer_order_no: orderId,

        memo,
      });

    if (orderError) {
      return NextResponse.json(
        {
          ok: false,
          message: orderError.message,
        },
        { status: 500 }
      );
    }

    const { error: itemError } = await supabase
      .from("domestic_order_item")
      .insert({
        order_id: orderId,
        item_text: itemSummary,
        price: 0,
      });

    if (itemError) {
      return NextResponse.json(
        {
          ok: false,
          message: itemError.message,
        },
        { status: 500 }
      );
    }

    const { error: shippingError } = await supabase
      .from("domestic_shipping")
      .insert({
        order_id: orderId,

        carrier: "",

        tracking_number: "",

        shipping_status: "접수대기",

        shipping_type: "일반택배",
      });

    if (shippingError) {
      return NextResponse.json(
        {
          ok: false,
          message: shippingError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      order_id: orderId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "신청 저장 실패",
      },
      { status: 500 }
    );
  }
}
