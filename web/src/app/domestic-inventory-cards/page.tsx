import InventoryCardsClient from "./InventoryCardsClient";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DomesticInventoryCardsPage() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>국내 재고 카드 관리</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return <InventoryCardsClient initialItems={data ?? []} />;
}
