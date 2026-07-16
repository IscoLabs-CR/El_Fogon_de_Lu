"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon, LockIcon } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { getDaySummary, registerSale, deleteSale } from "@/lib/rpc";
import { clock, longDate, money, todayCR } from "@/lib/format";
import type {
  CashSession,
  DaySummary,
  EmployeeBalance,
  PaymentMethod,
  Profile,
  Sale,
} from "@/lib/types";
import {
  Card,
  Empty,
  ErrorNote,
  Modal,
  PaymentPicker,
  PaymentTag,
  SectionTitle,
  Stat,
  Tag,
} from "@/components/ui";

export default function Dashboard({
  profile,
  initialSummary,
  initialSession,
  initialSales,
  employees,
}: {
  profile: Profile;
  initialSummary: DaySummary;
  initialSession: CashSession | null;
  initialSales: Sale[];
  employees: EmployeeBalance[];
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [session, setSession] = useState(initialSession);
  const [sales, setSales] = useState(initialSales);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cajaAbierta = session?.status === "abierta";
  const today = todayCR();

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [s, sess, list] = await Promise.all([
      getDaySummary(),
      supabase.from("cash_sessions").select("*").eq("status", "abierta").maybeSingle(),
      supabase
        .from("sales")
        .select("*")
        .eq("business_date", today)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    setSummary(s);
    setSession((sess.data as CashSession | null) ?? null);
    setSales((list.data ?? []) as Sale[]);
  }, [today]);

  // Las cifras del dia se mueven solas: el duenno deja la pantalla abierta.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("panel-del-dia")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "account_charges" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteSale(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow={longDate(summary.business_date)}
        title="Ventas de hoy"
        action={
          cajaAbierta ? (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <PlusIcon size={16} weight="bold" />
              Registrar venta
            </button>
          ) : (
            <Link href="/caja" className="btn-primary">
              <LockIcon size={16} weight="bold" />
              Abrir caja
            </Link>
          )
        }
      />

      {!cajaAbierta ? (
        <div
          className="card reveal mb-8 flex flex-wrap items-center justify-between gap-4 border-tarjeta-fg/20 bg-tarjeta-bg p-5"
          style={{ ["--index" as string]: 0 }}
        >
          <p className="text-[14px] text-tarjeta-fg">
            La caja esta cerrada. Mientras no se haga la apertura no se puede registrar
            ninguna venta, gasto ni consumo.
          </p>
          <Link href="/caja" className="btn-ghost border-tarjeta-fg/30 bg-paper">
            Hacer apertura
          </Link>
        </div>
      ) : null}

      <ErrorNote message={error} />

      {/* Bento asimetrico: la cifra que importa manda, el resto acompanna. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 lg:row-span-2" index={1}>
          <div className="flex h-full flex-col justify-between gap-8">
            <Stat
              label="Total vendido hoy"
              value={summary.ventas_total}
              size="lg"
              hint={`${summary.tickets} ${summary.tickets === 1 ? "venta" : "ventas"} registradas`}
            />

            <dl className="grid grid-cols-3 gap-4 border-t border-line pt-6">
              <div>
                <dt className="mb-1.5">
                  <Tag tone="efectivo">Efectivo</Tag>
                </dt>
                <dd className="num text-lg">{money(summary.ventas_efectivo)}</dd>
              </div>
              <div>
                <dt className="mb-1.5">
                  <Tag tone="sinpe">Sinpe</Tag>
                </dt>
                <dd className="num text-lg">{money(summary.ventas_sinpe)}</dd>
              </div>
              <div>
                <dt className="mb-1.5">
                  <Tag tone="tarjeta">Tarjeta</Tag>
                </dt>
                <dd className="num text-lg">{money(summary.ventas_tarjeta)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card index={2}>
          <Stat
            label="Neto del dia"
            value={summary.neto}
            hint={`Ventas menos ${money(summary.gastos_total)} de gastos`}
          />
        </Card>

        <Card index={3}>
          <Stat
            label="Consumo a credito hoy"
            value={summary.consumo_credito}
            tone="credito"
            // El credito no es ingreso hasta que el empleado paga. Sin esta aclaracion,
            // un dia de mucho fiado se leeria como un dia flojo.
            hint="No es venta. Entra como ingreso el dia que el empleado abona."
          />
        </Card>

        <Card className="lg:col-span-2" index={4}>
          <div className="grid gap-6 sm:grid-cols-3">
            <Stat label="Ventas de mostrador" value={summary.ventas_mostrador} />
            <Stat label="Abonos cobrados" value={summary.abonos_cobrados} />
            <Stat label="Gastos del dia" value={summary.gastos_total} tone="muted" />
          </div>
        </Card>

        <Card index={5}>
          <p className="eyebrow mb-3">Estado de caja</p>
          {cajaAbierta && session ? (
            <>
              <p className="font-serif text-2xl tracking-[-0.02em]">Abierta</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Desde las {clock(session.opened_at)} con {money(session.opening_amount)} de
                fondo.
              </p>
              <Link
                href="/caja"
                className="mt-4 inline-block text-[13px] text-ink underline underline-offset-4"
              >
                Ir al arqueo
              </Link>
            </>
          ) : (
            <>
              <p className="font-serif text-2xl tracking-[-0.02em] text-muted">Cerrada</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Haga la apertura para empezar a registrar.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-16">
        <h2 className="eyebrow mb-5">Ultimas ventas</h2>
        {sales.length === 0 ? (
          <Empty>Todavia no hay ventas registradas hoy.</Empty>
        ) : (
          <ul className="border-t border-line">
            {sales.map((sale, i) => (
              <li
                key={sale.id}
                className="reveal group flex items-center gap-4 border-b border-line py-4"
                style={{ ["--index" as string]: i }}
              >
                <span className="num w-14 shrink-0 text-[12px] text-muted">
                  {clock(sale.created_at)}
                </span>

                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {sale.description || (sale.source === "abono" ? "Abono" : "Venta")}
                  {sale.source === "abono" ? (
                    <span className="ml-2 align-middle">
                      <Tag tone="credito">Abono</Tag>
                    </span>
                  ) : null}
                </span>

                <PaymentTag method={sale.payment_method} />

                <span className="num w-28 shrink-0 text-right text-[15px]">
                  {money(sale.amount)}
                </span>

                {cajaAbierta ? (
                  <button
                    type="button"
                    onClick={() => onDelete(sale.id)}
                    className="text-[12px] text-muted underline-offset-4 opacity-0 transition-opacity hover:text-credito-fg hover:underline focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    Eliminar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <SaleModal
        open={open}
        onClose={() => setOpen(false)}
        employees={employees}
        onDone={refresh}
        canCollect={profile.role === "admin" || profile.role === "cobrador"}
      />
    </>
  );
}

function SaleModal({
  open,
  onClose,
  employees,
  onDone,
  canCollect,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmployeeBalance[];
  onDone: () => Promise<void>;
  canCollect: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setAmount("");
    setDescription("");
    setMethod("efectivo");
    setEmployeeId("");
    setError(null);
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
      await registerSale(value, description.trim(), method, employeeId || null);
      await onDone();
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar venta">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="amount" className="eyebrow block">
            Monto
          </label>
          <input
            id="amount"
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
          <label htmlFor="description" className="eyebrow block">
            Detalle
          </label>
          <input
            id="description"
            className="field"
            placeholder="Casado de pollo, fresco"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <span className="eyebrow block">Metodo de pago</span>
          <PaymentPicker value={method} onChange={setMethod} />
        </div>

        {canCollect && employees.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-5">
            <label htmlFor="employee" className="eyebrow block">
              Abono de empleado
            </label>
            <select
              id="employee"
              className="field"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Venta de mostrador</option>
              {employees.map((e) => (
                <option key={e.employee_id} value={e.employee_id}>
                  {e.employee_name} — {e.company_name} (debe {money(e.balance)})
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-relaxed text-muted">
              Si elige un empleado, el monto se abona a su cuenta y baja su saldo.
            </p>
          </div>
        ) : null}

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
