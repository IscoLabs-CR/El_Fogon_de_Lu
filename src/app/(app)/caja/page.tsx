import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { CashSession, Expense, Sale } from "@/lib/types";
import CajaPanel from "./CajaPanel";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("status", "abierta")
    .maybeSingle();

  const openSession = (session as CashSession | null) ?? null;

  const [salesRes, expensesRes, historyRes] = await Promise.all([
    openSession
      ? supabase
          .from("sales")
          .select("*")
          .eq("session_id", openSession.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    openSession
      ? supabase
          .from("expenses")
          .select("*")
          .eq("session_id", openSession.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("cash_sessions")
      .select("*")
      .eq("status", "cerrada")
      .order("business_date", { ascending: false })
      .limit(15),
  ]);

  return (
    <CajaPanel
      initialSession={openSession}
      initialSales={(salesRes.data ?? []) as Sale[]}
      initialExpenses={(expensesRes.data ?? []) as Expense[]}
      history={(historyRes.data ?? []) as CashSession[]}
    />
  );
}
