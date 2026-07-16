import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { todayCR } from "@/lib/format";
import type { CashSession, Expense, ExpenseRollup } from "@/lib/types";
import GastosPanel from "./GastosPanel";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  await requireProfile();
  const supabase = await createClient();

  const today = todayCR();
  const desde = new Date(today);
  desde.setDate(desde.getDate() - 84); // doce semanas hacia atras
  const from = desde.toISOString().slice(0, 10);

  const [sessionRes, expensesRes, weekRes, monthRes] = await Promise.all([
    supabase.from("cash_sessions").select("*").eq("status", "abierta").maybeSingle(),
    supabase
      .from("expenses")
      .select("*")
      .gte("business_date", from)
      .order("business_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.rpc("get_expenses_rollup", { p_from: from, p_to: today, p_bucket: "week" }),
    supabase.rpc("get_expenses_rollup", { p_from: from, p_to: today, p_bucket: "month" }),
  ]);

  return (
    <GastosPanel
      session={(sessionRes.data as CashSession | null) ?? null}
      expenses={(expensesRes.data ?? []) as Expense[]}
      weekly={(weekRes.data ?? []) as ExpenseRollup[]}
      monthly={(monthRes.data ?? []) as ExpenseRollup[]}
    />
  );
}
