import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { CashSession, Company, EmployeeBalance } from "@/lib/types";
import CreditosPanel from "./CreditosPanel";

export const dynamic = "force-dynamic";

export default async function CreditosPage() {
  await requireProfile();
  const supabase = await createClient();

  const [balancesRes, companiesRes, sessionRes] = await Promise.all([
    supabase.rpc("get_employee_balances", { p_company_id: null }),
    supabase.from("companies").select("*").eq("active", true).order("name"),
    supabase.from("cash_sessions").select("*").eq("status", "abierta").maybeSingle(),
  ]);

  return (
    <CreditosPanel
      balances={(balancesRes.data ?? []) as EmployeeBalance[]}
      companies={(companiesRes.data ?? []) as Company[]}
      session={(sessionRes.data as CashSession | null) ?? null}
    />
  );
}
