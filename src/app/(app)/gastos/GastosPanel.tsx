"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import { deleteExpense, registerExpense } from "@/lib/rpc";
import { money, shortDate } from "@/lib/format";
import {
  CATEGORY_LABEL,
  type CashSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseRollup,
  type PaymentMethod,
} from "@/lib/types";
import {
  Card,
  Empty,
  ErrorNote,
  Modal,
  PaymentPicker,
  PaymentTag,
  SectionTitle,
  Tag,
} from "@/components/ui";

const CATEGORIES: ExpenseCategory[] = [
  "insumos",
  "servicios",
  "planilla",
  "mantenimiento",
  "otros",
];

export default function GastosPanel({
  session,
  expenses,
  weekly,
  monthly,
}: {
  session: CashSession | null;
  expenses: Expense[];
  weekly: ExpenseRollup[];
  monthly: ExpenseRollup[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cajaAbierta = session?.status === "abierta";

  const semanaActual = weekly.at(-1);
  const mesActual = monthly.at(-1);

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteExpense(id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow="Salidas de dinero"
        title="Gastos"
        action={
          cajaAbierta ? (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <PlusIcon size={16} weight="bold" />
              Registrar gasto
            </button>
          ) : (
            <Link href="/caja" className="btn-ghost">
              Abrir caja
            </Link>
          )
        }
      />

      <ErrorNote message={error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card index={0}>
          <p className="eyebrow mb-2">Esta semana</p>
          <p className="num text-4xl tracking-[-0.02em]">
            {money(semanaActual?.total ?? 0)}
          </p>
          <CategoryBreakdown rollup={semanaActual} />
        </Card>

        <Card index={1}>
          <p className="eyebrow mb-2">Este mes</p>
          <p className="num text-4xl tracking-[-0.02em]">{money(mesActual?.total ?? 0)}</p>
          <CategoryBreakdown rollup={mesActual} />
        </Card>
      </div>

      <div className="mt-16 max-w-xl">
        <h2 className="eyebrow mb-5">Por mes</h2>
        {monthly.length === 0 ? (
          <Empty>Sin gastos registrados.</Empty>
        ) : (
          <ul className="border-t border-line">
            {[...monthly].reverse().map((m) => (
              <li key={m.bucket} className="flex items-center gap-4 border-b border-line py-3">
                <span className="num flex-1 text-[13px] text-muted">
                  {shortDate(m.bucket)}
                </span>
                <span className="num text-[15px]">{money(m.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-16">
        <h2 className="eyebrow mb-5">Detalle</h2>
        {expenses.length === 0 ? (
          <Empty>Todavia no hay gastos.</Empty>
        ) : (
          <ul className="border-t border-line">
            {expenses.map((e, i) => {
              const puedeEliminar =
                cajaAbierta && session && e.session_id === session.id;
              return (
                <li
                  key={e.id}
                  className="reveal group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line py-3 sm:flex sm:gap-4"
                  style={{ ["--index" as string]: Math.min(i, 10) }}
                >
                  <span className="num text-[12px] text-muted sm:order-1 sm:w-14 sm:shrink-0">
                    {shortDate(e.business_date)}
                  </span>
                  <span className="min-w-0 truncate text-[15px] sm:order-2 sm:flex-1">
                    {e.description || "Gasto"}
                  </span>
                  <span className="num whitespace-nowrap text-right text-[15px] sm:order-4 sm:w-28 sm:shrink-0">
                    {money(e.amount)}
                  </span>
                  <div className="col-span-2 flex items-center gap-2 sm:order-3 sm:col-auto">
                    <Tag>{CATEGORY_LABEL[e.category]}</Tag>
                    <PaymentTag method={e.paid_with} />
                  </div>
                  {puedeEliminar ? (
                    <button
                      type="button"
                      onClick={() => onDelete(e.id)}
                      className="justify-self-end text-[12px] text-muted underline-offset-4 transition-opacity hover:text-credito-fg hover:underline sm:order-5 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExpenseModal
        open={open}
        onClose={() => setOpen(false)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function CategoryBreakdown({ rollup }: { rollup: ExpenseRollup | undefined }) {
  const entries = Object.entries(rollup?.por_categoria ?? {}) as [
    ExpenseCategory,
    number,
  ][];

  if (entries.length === 0) {
    return <p className="mt-4 text-[13px] text-muted">Sin gastos en el periodo.</p>;
  }

  return (
    <dl className="mt-6 space-y-2 border-t border-line pt-5">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([cat, total]) => (
          <div key={cat} className="flex items-center justify-between gap-4">
            <dt className="text-[13px] text-muted">{CATEGORY_LABEL[cat]}</dt>
            <dd className="num text-[14px]">{money(total)}</dd>
          </div>
        ))}
    </dl>
  );
}

function ExpenseModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("insumos");
  const [paidWith, setPaidWith] = useState<PaymentMethod>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await registerExpense(value, description.trim(), category, paidWith);
      onDone();
      onClose();
      setAmount("");
      setDescription("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar gasto">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="gasto-monto" className="eyebrow block">
            Monto
          </label>
          <input
            id="gasto-monto"
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
          <label htmlFor="gasto-detalle" className="eyebrow block">
            Detalle
          </label>
          <input
            id="gasto-detalle"
            className="field"
            placeholder="Verduras en la feria"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="gasto-categoria" className="eyebrow block">
            Categoria
          </label>
          <select
            id="gasto-categoria"
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <span className="eyebrow block">Pagado con</span>
          <PaymentPicker value={paidWith} onChange={setPaidWith} name="gasto-pago" />
        </div>

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
