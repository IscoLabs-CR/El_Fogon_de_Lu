import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { PAYMENT_LABEL, type EmployeeBalance, type StatementRow } from "@/lib/types";
import { Card, Empty, SectionTitle, Tag } from "@/components/ui";
import FacturaButton from "./FacturaButton";

export const dynamic = "force-dynamic";

export default async function EstadoCuentaPage({
  params,
}: {
  params: Promise<{ empleadoId: string }>;
}) {
  await requireProfile();
  const { empleadoId } = await params;
  const supabase = await createClient();

  const [balancesRes, statementRes] = await Promise.all([
    supabase.rpc("get_employee_balances", { p_company_id: null }),
    supabase.rpc("get_employee_statement", { p_employee_id: empleadoId, p_limit: 100 }),
  ]);

  const balances = (balancesRes.data ?? []) as EmployeeBalance[];
  const empleado = balances.find((b) => b.employee_id === empleadoId);
  if (!empleado) notFound();

  const rows = (statementRes.data ?? []) as StatementRow[];
  const saldo = Number(empleado.balance);

  const totalCargos = rows
    .filter((r) => r.tipo === "cargo")
    .reduce((sum, r) => sum + Number(r.monto), 0);
  const totalAbonos = rows
    .filter((r) => r.tipo === "abono")
    .reduce((sum, r) => sum + Number(r.monto), 0);

  return (
    <>
      <Link
        href="/creditos"
        className="mb-8 inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeftIcon size={14} weight="bold" />
        Volver a creditos
      </Link>

      <SectionTitle
        eyebrow={empleado.company_name}
        title={empleado.employee_name}
        action={
          <FacturaButton
            employeeId={empleado.employee_id}
            employeeName={empleado.employee_name}
            companyName={empleado.company_name}
            currentBalance={saldo}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card index={0}>
          <p className="eyebrow mb-2">Saldo actual</p>
          {saldo < 0 ? (
            <>
              <p className="num text-4xl tracking-[-0.02em] text-efectivo-fg">
                {money(Math.abs(saldo))}
              </p>
              <p className="mt-2 text-[13px] text-muted">A favor del empleado.</p>
            </>
          ) : (
            <>
              <p
                className={`num text-4xl tracking-[-0.02em] ${
                  saldo > 0 ? "text-credito-fg" : ""
                }`}
              >
                {money(saldo)}
              </p>
              <p className="mt-2 text-[13px] text-muted">
                {saldo === 0 ? "La cuenta esta al dia." : "Pendiente de cobro."}
              </p>
            </>
          )}
        </Card>

        <Card index={1}>
          <p className="eyebrow mb-2">Consumido</p>
          <p className="num text-4xl tracking-[-0.02em]">{money(totalCargos)}</p>
          <p className="mt-2 text-[13px] text-muted">En los movimientos visibles.</p>
        </Card>

        <Card index={2}>
          <p className="eyebrow mb-2">Abonado</p>
          <p className="num text-4xl tracking-[-0.02em]">{money(totalAbonos)}</p>
          <p className="mt-2 text-[13px] text-muted">En los movimientos visibles.</p>
        </Card>
      </div>

      <div className="mt-16">
        <h2 className="eyebrow mb-5">Estado de cuenta</h2>
        {rows.length === 0 ? (
          <Empty>Sin movimientos registrados.</Empty>
        ) : (
          <ul className="border-t border-line">
            {rows.map((r, i) => (
              <li
                key={r.mov_id}
                className="reveal flex items-center gap-4 border-b border-line py-3.5"
                style={{ ["--index" as string]: Math.min(i, 12) }}
              >
                <span className="num w-14 shrink-0 text-[12px] text-muted">
                  {shortDate(r.fecha)}
                </span>

                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {r.descripcion || (r.tipo === "abono" ? "Abono" : "Consumo")}
                </span>

                {r.tipo === "abono" ? (
                  <Tag tone="efectivo">
                    Abono{r.metodo ? ` · ${PAYMENT_LABEL[r.metodo]}` : ""}
                  </Tag>
                ) : (
                  <Tag tone="credito">Consumo</Tag>
                )}

                <span
                  className={`num w-28 shrink-0 text-right text-[15px] ${
                    r.tipo === "abono" ? "text-efectivo-fg" : ""
                  }`}
                >
                  {r.tipo === "abono" ? "-" : "+"}
                  {money(r.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
