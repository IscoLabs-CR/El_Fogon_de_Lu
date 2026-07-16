import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { Company, CompanyEmployee } from "@/lib/types";
import EmpresasPanel from "./EmpresasPanel";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  // Solo admin. El proxy ya redirige al cobrador; esto es la segunda barrera.
  await requireAdmin();
  const supabase = await createClient();

  const [companiesRes, employeesRes] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("company_employees").select("*").order("name"),
  ]);

  return (
    <EmpresasPanel
      companies={(companiesRes.data ?? []) as Company[]}
      employees={(employeesRes.data ?? []) as CompanyEmployee[]}
    />
  );
}
