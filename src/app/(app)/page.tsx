import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { todayCR } from "@/lib/format";
import type { CashSession, DaySummary, Sale } from "@/lib/types";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = todayCR();

  const [summaryRes, sessionRes, salesRes, employeesRes] = await Promise.all([
    supabase.rpc("get_day_summary", { p_date: null }),
    supabase.from("cash_sessions").select("*").eq("status", "abierta").maybeSingle(),
    supabase
      .from("sales")
      .select("*")
      .eq("business_date", today)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.rpc("get_employee_balances", { p_company_id: null }),
  ]);

  return (
    <Dashboard
      profile={profile}
      initialSummary={summaryRes.data as DaySummary}
      initialSession={(sessionRes.data as CashSession | null) ?? null}
      initialSales={(salesRes.data ?? []) as Sale[]}
      employees={employeesRes.data ?? []}
    />
  );
}
