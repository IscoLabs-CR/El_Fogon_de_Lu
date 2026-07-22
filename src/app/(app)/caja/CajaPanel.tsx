"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { closeCashSession, openCashSession } from "@/lib/rpc";
import { clock, longDate, money, shortDate } from "@/lib/format";
import type { CashSession, Expense, Sale } from "@/lib/types";
import {
  Card,
  Empty,
  ErrorNote,
  Modal,
  PaymentTag,
  SectionTitle,
  Stat,
  Tag,
} from "@/components/ui";

export default function CajaPanel({
  initialSession,
  initialSales,
  initialExpenses,
  history,
  isAdmin,
}: {
  initialSession: CashSession | null;
  initialSales: Sale[];
  initialExpenses: Expense[];
  history: CashSession[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState<"apertura" | "cierre" | null>(null);

  const session = initialSession;
  const abierta = session?.status === "abierta";

  // El arqueo solo cuenta efectivo. Un abono por Sinpe o tarjeta es venta,
  // pero no entra a la gaveta.
  const totals = useMemo(() => {
    const ventasEfectivo = initialSales
      .filter((s) => s.payment_method === "efectivo")
      .reduce((sum, s) => sum + Number(s.amount), 0);
    const ventasTotal = initialSales.reduce((sum, s) => sum + Number(s.amount), 0);
    const gastosEfectivo = initialExpenses
      .filter((e) => e.paid_with === "efectivo")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const esperado = session
      ? Number(session.opening_amount) + ventasEfectivo - gastosEfectivo
      : 0;
    return { ventasEfectivo, ventasTotal, gastosEfectivo, esperado };
  }, [initialSales, initialExpenses, session]);

  return (
    <>
      <SectionTitle
        eyebrow={abierta && session ? longDate(session.business_date) : "Sin caja abierta"}
        title="Caja"
        action={
          abierta ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setOpenDialog("cierre")}
            >
              Cerrar caja
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setOpenDialog("apertura")}
            >
              Abrir caja
            </button>
          )
        }
      />

      {abierta && session ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <Card index={0}>
              <Stat
                label="Fondo de apertura"
                value={Number(session.opening_amount)}
                hint={`Abierta a las ${clock(session.opened_at)}`}
              />
            </Card>
            <Card index={1}>
              <Stat label="Ventas en efectivo" value={totals.ventasEfectivo} />
            </Card>
            <Card index={2}>
              <Stat label="Gastos en efectivo" value={totals.gastosEfectivo} tone="muted" />
            </Card>
            <Card index={3}>
              <Stat
                label="Efectivo esperado"
                value={totals.esperado}
                hint="Fondo + ventas en efectivo - gastos en efectivo"
              />
            </Card>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="eyebrow mb-5">
                Movimientos del dia ({initialSales.length})
              </h2>
              {initialSales.length === 0 ? (
                <Empty>Sin ventas en esta caja.</Empty>
              ) : (
                <ul className="border-t border-line">
                  {initialSales.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 border-b border-line py-3"
                    >
                      <span className="num w-14 shrink-0 text-[12px] text-muted">
                        {clock(s.created_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {s.description || (s.source === "abono" ? "Abono" : "Venta")}
                      </span>
                      <PaymentTag method={s.payment_method} />
                      <span className="num w-24 shrink-0 text-right text-[14px]">
                        {money(s.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="eyebrow mb-5">Gastos del dia ({initialExpenses.length})</h2>
              {initialExpenses.length === 0 ? (
                <Empty>Sin gastos en esta caja.</Empty>
              ) : (
                <ul className="border-t border-line">
                  {initialExpenses.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 border-b border-line py-3"
                    >
                      <span className="num w-14 shrink-0 text-[12px] text-muted">
                        {clock(e.created_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {e.description || "Gasto"}
                      </span>
                      <PaymentTag method={e.paid_with} />
                      <span className="num w-24 shrink-0 text-right text-[14px] text-muted">
                        -{money(e.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : (
        <Card index={0}>
          <p className="max-w-lg text-[15px] leading-relaxed text-muted">
            No hay caja abierta. Haga la apertura con el fondo con el que arranca el dia:
            hasta entonces el sistema no acepta ventas, gastos ni consumos a credito.
          </p>
        </Card>
      )}

      {/* Los cierres anteriores solo los ve el admin; el cobrador no. */}
      {isAdmin ? (
        <div className="mt-20">
          <h2 className="eyebrow mb-5">Cierres anteriores</h2>
          {history.length === 0 ? (
            <Empty>Todavia no hay cierres registrados.</Empty>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="eyebrow py-3 font-normal">Dia</th>
                  <th className="eyebrow py-3 text-right font-normal">Fondo</th>
                  <th className="eyebrow py-3 text-right font-normal">Ventas</th>
                  <th className="eyebrow py-3 text-right font-normal">Esperado</th>
                  <th className="eyebrow py-3 text-right font-normal">Contado</th>
                  <th className="eyebrow py-3 text-right font-normal">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const diff = Number(h.difference ?? 0);
                  return (
                    <tr key={h.id} className="border-b border-line">
                      <td className="num py-3">{shortDate(h.business_date)}</td>
                      <td className="num py-3 text-right">{money(h.opening_amount)}</td>
                      <td className="num py-3 text-right">{money(h.total_sales ?? 0)}</td>
                      <td className="num py-3 text-right">{money(h.expected_cash ?? 0)}</td>
                      <td className="num py-3 text-right">{money(h.counted_cash ?? 0)}</td>
                      <td className="py-3 text-right">
                        {diff === 0 ? (
                          <Tag tone="efectivo">Cuadro</Tag>
                        ) : (
                          <span className="num text-credito-fg">
                            {diff > 0 ? "+" : ""}
                            {money(diff)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      ) : null}

      <AperturaModal
        open={openDialog === "apertura"}
        onClose={() => setOpenDialog(null)}
        onDone={() => router.refresh()}
      />

      <CierreModal
        open={openDialog === "cierre"}
        onClose={() => setOpenDialog(null)}
        expected={totals.esperado}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function AperturaModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError("El fondo no puede ser negativo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openCashSession(value, notes.trim() || undefined);
      onDone();
      onClose();
      setAmount("");
      setNotes("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Apertura de caja">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="opening" className="eyebrow block">
            Fondo con el que arranca
          </label>
          <input
            id="opening"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="field num text-2xl"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="notes-open" className="eyebrow block">
            Nota
          </label>
          <input
            id="notes-open"
            className="field"
            placeholder="Opcional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Abriendo..." : "Abrir caja"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CierreModal({
  open,
  onClose,
  expected,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  expected: number;
  onDone: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countedValue = Number(counted);
  const diff = Number.isFinite(countedValue) && counted !== "" ? countedValue - expected : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(countedValue) || countedValue < 0) {
      setError("El efectivo contado no puede ser negativo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeCashSession(countedValue, notes.trim() || undefined);
      onDone();
      onClose();
      setCounted("");
      setNotes("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cierre de caja">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="rounded-control border border-line bg-surface p-4">
          <p className="eyebrow mb-1">Efectivo esperado en gaveta</p>
          <p className="num text-3xl tracking-[-0.02em]">{money(expected)}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="counted" className="eyebrow block">
            Efectivo contado
          </label>
          <input
            id="counted"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="field num text-2xl"
            placeholder="0"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            required
          />
        </div>

        {diff !== null ? (
          <p
            className={`rounded-control px-3 py-2 text-[13px] ${
              diff === 0
                ? "bg-efectivo-bg text-efectivo-fg"
                : "bg-credito-bg text-credito-fg"
            }`}
          >
            {diff === 0
              ? "La caja cuadra."
              : diff > 0
                ? `Sobran ${money(diff)}.`
                : `Faltan ${money(Math.abs(diff))}.`}
          </p>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="notes-close" className="eyebrow block">
            Nota
          </label>
          <input
            id="notes-close"
            className="field"
            placeholder="Opcional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Cerrando..." : "Cerrar caja"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
