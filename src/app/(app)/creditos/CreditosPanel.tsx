"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerCharge, registerSale } from "@/lib/rpc";
import { money, shortDate } from "@/lib/format";
import type {
  CashSession,
  Company,
  EmployeeBalance,
  PaymentMethod,
} from "@/lib/types";
import {
  Card,
  Empty,
  ErrorNote,
  Modal,
  PaymentPicker,
  SectionTitle,
  Tag,
} from "@/components/ui";

type Dialog =
  | { kind: "consumo"; employee: EmployeeBalance }
  | { kind: "abono"; employee: EmployeeBalance }
  | null;

export default function CreditosPanel({
  balances,
  companies,
  session,
}: {
  balances: EmployeeBalance[];
  companies: Company[];
  session: CashSession | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState<string>("");

  const cajaAbierta = session?.status === "abierta";

  const visible = filter ? balances.filter((b) => b.company_id === filter) : balances;

  const totalPorCobrar = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  return (
    <>
      <SectionTitle eyebrow="Cuentas por cobrar" title="Creditos" />

      {!cajaAbierta ? (
        <div className="card mb-8 flex flex-wrap items-center justify-between gap-4 border-tarjeta-fg/20 bg-tarjeta-bg p-5">
          <p className="text-[14px] text-tarjeta-fg">
            La caja esta cerrada. Para anotar un consumo o cobrar un abono hay que hacer
            primero la apertura.
          </p>
          <Link href="/caja" className="btn-ghost border-tarjeta-fg/30 bg-paper">
            Hacer apertura
          </Link>
        </div>
      ) : null}

      <Card index={0} className="max-w-sm">
        <p className="eyebrow mb-2">Total por cobrar</p>
        <p className="num text-3xl tracking-[-0.02em]">{money(totalPorCobrar)}</p>
        <p className="mt-2 text-[13px] text-muted">
          {balances.length} empleados con cuenta abierta.
        </p>
      </Card>

      <div className="mt-16 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("")}
          className={`rounded-control px-3 py-1.5 text-[13px] transition-colors ${
            filter === "" ? "bg-ink text-paper" : "border border-line text-muted hover:bg-surface"
          }`}
        >
          Todas
        </button>
        {companies.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`rounded-control px-3 py-1.5 text-[13px] transition-colors ${
              filter === c.id
                ? "bg-ink text-paper"
                : "border border-line text-muted hover:bg-surface"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {visible.length === 0 ? (
          <Empty>No hay empleados registrados. Agreguelos desde Empresas.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="eyebrow py-3 font-normal">Empleado</th>
                  <th className="eyebrow py-3 font-normal">Empresa</th>
                  <th className="eyebrow py-3 font-normal">Ultimo movimiento</th>
                  <th className="eyebrow py-3 text-right font-normal">Saldo</th>
                  <th className="eyebrow py-3 text-right font-normal">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const saldo = Number(b.balance);
                  return (
                    <tr key={b.employee_id} className="border-b border-line">
                      <td className="py-3">
                        <Link
                          href={`/creditos/${b.employee_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {b.employee_name}
                        </Link>
                        {/* Se fue de la empresa pero quedo debiendo: hay que poder cobrarle. */}
                        {!b.employee_active || !b.company_active ? (
                          <span className="ml-2 align-middle">
                            <Tag tone="credito">De baja</Tag>
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 text-muted">{b.company_name}</td>
                      <td className="num py-3 text-muted">
                        {b.last_movement ? shortDate(b.last_movement) : "—"}
                      </td>
                      <td className="py-3 text-right">
                        {saldo === 0 ? (
                          <Tag tone="efectivo">Al dia</Tag>
                        ) : saldo < 0 ? (
                          // Sobrepago: el empleado abono de mas. No es un error.
                          <span className="num text-efectivo-fg">
                            {money(Math.abs(saldo))} a favor
                          </span>
                        ) : (
                          <span className="num text-credito-fg">{money(saldo)}</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            // A un empleado de baja no se le fia mas, pero si se le cobra.
                            disabled={!cajaAbierta || !b.employee_active || !b.company_active}
                            onClick={() => setDialog({ kind: "consumo", employee: b })}
                            className="rounded-control border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Consumo
                          </button>
                          <button
                            type="button"
                            disabled={!cajaAbierta}
                            onClick={() => setDialog({ kind: "abono", employee: b })}
                            className="rounded-control bg-ink px-2.5 py-1 text-[12px] text-paper transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Cobrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MovimientoModal
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function MovimientoModal({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!dialog) return null;

  const esAbono = dialog.kind === "abono";
  const empleado = dialog.employee;

  function close() {
    setAmount("");
    setDescription("");
    setMethod("efectivo");
    setError(null);
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("El monto debe ser mayor a cero.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (esAbono) {
        // El abono ES el ingreso: entra como venta y sube el total del dia.
        await registerSale(
          value,
          description.trim() || `Abono ${empleado.employee_name}`,
          method,
          empleado.employee_id,
        );
      } else {
        // El consumo NO es ingreso: solo sube el saldo del empleado.
        await registerCharge(empleado.employee_id, value, description.trim());
      }
      onDone();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={esAbono ? "Cobrar abono" : "Anotar consumo"}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="rounded-control border border-line bg-surface p-4">
          <p className="text-[15px]">{empleado.employee_name}</p>
          <p className="mt-1 text-[13px] text-muted">
            {empleado.company_name} · debe{" "}
            <span className="num">{money(Number(empleado.balance))}</span>
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="mov-monto" className="eyebrow block">
            Monto
          </label>
          <input
            id="mov-monto"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="field num text-2xl"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="mov-detalle" className="eyebrow block">
            Detalle
          </label>
          <input
            id="mov-detalle"
            className="field"
            placeholder={esAbono ? "Pago de quincena" : "Almuerzo"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {esAbono ? (
          <div className="space-y-2">
            <span className="eyebrow block">Con que paga</span>
            <PaymentPicker value={method} onChange={setMethod} name="abono-pago" />
          </div>
        ) : (
          <p className="rounded-control bg-credito-bg px-3 py-2 text-[13px] leading-relaxed text-credito-fg">
            El consumo no cuenta como venta del dia. El ingreso se registra cuando el
            empleado pague.
          </p>
        )}

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Guardando..." : esAbono ? "Cobrar" : "Anotar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
