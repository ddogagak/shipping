import InventoryClient from "./InventoryClient";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DomesticInventoryPage() {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>인벤토리</h1>
        <p>DB 조회 실패: {error.message}</p>
      </main>
    );
  }

  return <InventoryClient initialItems={data ?? []} />;
}
