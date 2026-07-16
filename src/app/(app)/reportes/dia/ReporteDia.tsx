"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDaySummary } from "@/lib/rpc";
import { clock, longDate, money } from "@/lib/format";
import type { DaySummary, Role, Sale } from "@/lib/types";
import {
  Card,
  Empty,
  ErrorNote,
  PaymentTag,
  SectionTitle,
  Stat,
  Tag,
} from "@/components/ui";

export default function ReporteDia({ role, today }: { role: Role; today: string }) {
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const esAdmin = role === "admin";

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [s, list] = await Promise.all([
        getDaySummary(d),
        supabase
          .from("sales")
          .select("*")
          .eq("business_date", d)
          .order("created_at", { ascending: false }),
      ]);
      setSummary(s);
      setSales((list.data ?? []) as Sale[]);
    } catch (e) {
      setError((e as Error).message);
      setSummary(null);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  return (
    <>
      <SectionTitle
        eyebrow="Registro de ventas"
        title="Ventas por dia"
        action={
          esAdmin ? (
            <input
              type="date"
              className="field num w-auto"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Dia a consultar"
            />
          ) : (
            <Tag>Solo hoy</Tag>
          )
        }
      />

      {!esAdmin ? (
        <p className="mb-8 max-w-2xl text-[14px] leading-relaxed text-muted">
          Su usuario ve el detalle del dia en curso. Los dias anteriores y los totales del
          mes los consulta la administracion.
        </p>
      ) : null}

      <ErrorNote message={error} />

      {loading || !summary ? (
        <Card index={0}>
          <p className="text-[14px] text-muted">Cargando...</p>
        </Card>
      ) : (
        <>
          <p className="eyebrow mb-6">{longDate(summary.business_date)}</p>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" index={0}>
              <Stat
                label="Total vendido"
                value={summary.ventas_total}
                size="lg"
                hint={`${summary.tickets} ${summary.tickets === 1 ? "venta" : "ventas"}`}
              />
              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
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
            </Card>

            <div className="grid gap-4">
              <Card index={1}>
                <Stat label="Neto" value={summary.neto} hint="Ventas menos gastos" />
              </Card>
              <Card index={2}>
                <Stat label="Gastos" value={summary.gastos_total} tone="muted" />
              </Card>
            </div>

            <Card index={3}>
              <Stat label="Mostrador" value={summary.ventas_mostrador} />
            </Card>
            <Card index={4}>
              <Stat label="Abonos cobrados" value={summary.abonos_cobrados} />
            </Card>
            <Card index={5}>
              <Stat
                label="Consumo a credito"
                value={summary.consumo_credito}
                tone="credito"
                hint="No es venta del dia."
              />
            </Card>
          </div>

          <div className="mt-16">
            <h2 className="eyebrow mb-5">Detalle de ventas</h2>
            {sales.length === 0 ? (
              <Empty>Sin ventas ese dia.</Empty>
            ) : (
              <ul className="border-t border-line">
                {sales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-4 border-b border-line py-3"
                  >
                    <span className="num w-14 shrink-0 text-[12px] text-muted">
                      {clock(s.created_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {s.description || (s.source === "abono" ? "Abono" : "Venta")}
                    </span>
                    {s.source === "abono" ? <Tag tone="credito">Abono</Tag> : null}
                    <PaymentTag method={s.payment_method} />
                    <span className="num w-28 shrink-0 text-right text-[15px]">
                      {money(s.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
