import { createClient } from "@/lib/supabase/client";
import type {
  AccountCharge,
  CashSession,
  Company,
  CompanyEmployee,
  DaySummary,
  EmployeeBalance,
  Expense,
  ExpenseRollup,
  MonthSummary,
  PaymentMethod,
  Sale,
  StatementRow,
} from "@/lib/types";

/**
 * Unica superficie de escritura de la app.
 *
 * En la base no hay policies de INSERT/UPDATE/DELETE: `authenticated` tiene
 * revocados esos permisos sobre todas las tablas. Toda escritura pasa por estos
 * RPC `security definer`, que son los que garantizan que no se pueda registrar
 * nada sin caja abierta ni contra una caja ya cerrada.
 */

/** Postgres devuelve mensajes en espanol desde los RAISE EXCEPTION; se usan tal cual. */
function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

export async function openCashSession(openingAmount: number, notes?: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("open_cash_session", {
    p_opening_amount: openingAmount,
    p_notes: notes ?? null,
  });
  fail(error);
  return data as CashSession;
}

export async function closeCashSession(countedCash: number, notes?: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_counted_cash: countedCash,
    p_notes: notes ?? null,
  });
  fail(error);
  return data as CashSession;
}

/** Venta de mostrador si employeeId es null; abono del empleado si viene con id. */
export async function registerSale(
  amount: number,
  description: string,
  paymentMethod: PaymentMethod,
  employeeId?: string | null,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_sale", {
    p_amount: amount,
    p_description: description,
    p_payment_method: paymentMethod,
    p_employee_id: employeeId ?? null,
  });
  fail(error);
  return data as Sale;
}

/** Consumo a credito. No es ingreso: solo sube el saldo del empleado. */
export async function registerCharge(
  employeeId: string,
  amount: number,
  description: string,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_charge", {
    p_employee_id: employeeId,
    p_amount: amount,
    p_description: description,
  });
  fail(error);
  return data as AccountCharge;
}

export async function registerExpense(
  amount: number,
  description: string,
  category: string,
  paidWith: PaymentMethod,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_expense", {
    p_amount: amount,
    p_description: description,
    p_category: category,
    p_paid_with: paidWith,
  });
  fail(error);
  return data as Expense;
}

export async function deleteSale(id: string) {
  const supabase = createClient();
  fail((await supabase.rpc("delete_sale", { p_id: id })).error);
}

export async function deleteExpense(id: string) {
  const supabase = createClient();
  fail((await supabase.rpc("delete_expense", { p_id: id })).error);
}

export async function deleteCharge(id: string) {
  const supabase = createClient();
  fail((await supabase.rpc("delete_charge", { p_id: id })).error);
}

export async function getDaySummary(date?: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_day_summary", {
    p_date: date ?? null,
  });
  fail(error);
  return data as DaySummary;
}

/** Solo admin. La funcion lanza 42501 para el cobrador. */
export async function getMonthSummary(year: number, month: number) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_month_summary", {
    p_year: year,
    p_month: month,
  });
  fail(error);
  return data as MonthSummary;
}

export async function getExpensesRollup(
  from: string,
  to: string,
  bucket: "week" | "month",
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_expenses_rollup", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });
  fail(error);
  return (data ?? []) as ExpenseRollup[];
}

export async function getEmployeeBalances(companyId?: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_employee_balances", {
    p_company_id: companyId ?? null,
  });
  fail(error);
  return (data ?? []) as EmployeeBalance[];
}

export async function getEmployeeStatement(employeeId: string, limit = 100) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_employee_statement", {
    p_employee_id: employeeId,
    p_limit: limit,
  });
  fail(error);
  return (data ?? []) as StatementRow[];
}

export async function upsertCompany(
  id: string | null,
  name: string,
  active = true,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_company", {
    p_id: id,
    p_name: name,
    p_active: active,
  });
  fail(error);
  return data as Company;
}

export async function upsertEmployee(
  id: string | null,
  companyId: string,
  name: string,
  active = true,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_employee", {
    p_id: id,
    p_company_id: companyId,
    p_name: name,
    p_active: active,
  });
  fail(error);
  return data as CompanyEmployee;
}

/** Solo si no tiene historial. Si tiene movimientos, la base lo rechaza y hay que darlo de baja. */
export async function deleteEmployee(id: string) {
  const supabase = createClient();
  fail((await supabase.rpc("delete_employee", { p_id: id })).error);
}

/** Solo si ninguno de sus empleados tiene historial. */
export async function deleteCompany(id: string) {
  const supabase = createClient();
  fail((await supabase.rpc("delete_company", { p_id: id })).error);
}
