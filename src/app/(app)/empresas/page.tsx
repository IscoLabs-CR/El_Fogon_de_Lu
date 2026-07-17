import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { Company, CompanyEmployee } from "@/lib/types";
import EmpresasPanel from "./EmpresasPanel";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  // Admin y cobrador: ambos gestionan empresas y empleados para poder fiar.
  await requireProfile();
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
