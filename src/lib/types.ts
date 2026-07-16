export type Role = "admin" | "cobrador";
export type PaymentMethod = "efectivo" | "sinpe" | "tarjeta";
export type SaleSource = "mostrador" | "abono";
export type ExpenseCategory =
  | "insumos"
  | "servicios"
  | "planilla"
  | "mantenimiento"
  | "otros";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
};

export type CashSession = {
  id: string;
  business_date: string;
  status: "abierta" | "cerrada";
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  total_sales: number | null;
  total_efectivo: number | null;
  total_sinpe: number | null;
  total_tarjeta: number | null;
  total_expenses_efectivo: number | null;
  total_charges: number | null;
  notes: string | null;
};

export type Sale = {
  id: string;
  session_id: string;
  business_date: string;
  amount: number;
  description: string;
  payment_method: PaymentMethod;
  source: SaleSource;
  employee_id: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  session_id: string;
  business_date: string;
  amount: number;
  description: string;
  category: ExpenseCategory;
  paid_with: PaymentMethod;
  created_at: string;
};

export type AccountCharge = {
  id: string;
  session_id: string;
  business_date: string;
  employee_id: string;
  amount: number;
  description: string;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  active: boolean;
};

export type CompanyEmployee = {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  opening_balance: number;
};

export type EmployeeBalance = {
  employee_id: string;
  employee_name: string;
  company_id: string;
  company_name: string;
  balance: number;
  last_movement: string | null;
  /** Un empleado dado de baja sigue apareciendo mientras deba plata: hay que poder cobrarle. */
  employee_active: boolean;
  company_active: boolean;
};

export type StatementRow = {
  fecha: string;
  tipo: "cargo" | "abono";
  descripcion: string;
  monto: number;
  metodo: PaymentMethod | null;
  mov_id: string;
};

export type DaySummary = {
  business_date: string;
  ventas_total: number;
  ventas_efectivo: number;
  ventas_sinpe: number;
  ventas_tarjeta: number;
  ventas_mostrador: number;
  abonos_cobrados: number;
  gastos_total: number;
  gastos_efectivo: number;
  /** Consumo a credito del dia. NO es venta: el ingreso se reconoce al cobrar el abono. */
  consumo_credito: number;
  neto: number;
  tickets: number;
};

export type MonthSummary = {
  period: string;
  ventas_total: number;
  ventas_efectivo: number;
  ventas_sinpe: number;
  ventas_tarjeta: number;
  ventas_mostrador: number;
  abonos_cobrados: number;
  gastos_total: number;
  consumo_credito: number;
  tickets: number;
  neto: number;
  por_dia: { d: string; ventas: number; gastos: number }[];
};

export type ExpenseRollup = {
  bucket: string;
  total: number;
  por_categoria: Partial<Record<ExpenseCategory, number>>;
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  sinpe: "Sinpe Movil",
  tarjeta: "Tarjeta",
};

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  insumos: "Insumos",
  servicios: "Servicios",
  planilla: "Planilla",
  mantenimiento: "Mantenimiento",
  otros: "Otros",
};
