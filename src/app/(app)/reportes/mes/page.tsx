import { requireAdmin } from "@/lib/auth";
import { todayCR } from "@/lib/format";
import ReporteMes from "./ReporteMes";

export const dynamic = "force-dynamic";

export default async function ReporteMesPage() {
  // Solo admin. Ademas del proxy y de este guard, la RLS de `sales` impide que el
  // cobrador alcance filas fuera del dia, y get_month_summary lanza 42501.
  await requireAdmin();

  const today = todayCR();
  const [year, month] = today.split("-").map(Number);

  return <ReporteMes initialYear={year} initialMonth={month} />;
}
