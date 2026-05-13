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

    order_status: "accepted",

    item_summary: itemSummary,

    customer_order_no: orderId,

    memo,
  });
