"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { getMonthSummary } from "@/lib/rpc";
import { money, monthName, shortDate } from "@/lib/format";
import type { MonthSummary } from "@/lib/types";
import { Card, Empty, ErrorNote, SectionTitle, Stat, Tag } from "@/components/ui";

export default function ReporteMes({
  initialYear,
  initialMonth,
}: {
  initialYear: number;
  initialMonth: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [current, setCurrent] = useState<MonthSummary | null>(null);
  const [previous, setPrevious] = useState<MonthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const [cur, prev] = await Promise.all([
        getMonthSummary(y, m),
        getMonthSummary(prevYear, prevMonth),
      ]);
      setCurrent(cur);
      setPrevious(prev);
    } catch (e) {
      setError((e as Error).message);
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year, month);
  }, [year, month, load]);

  function shift(delta: number) {
    const m = month + delta;
    if (m < 1) {
      setMonth(12);
      setYear(year - 1);
    } else if (m > 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(m);
    }
  }

  const variacion = useMemo(() => {
    if (!current || !previous || Number(previous.ventas_total) === 0) return null;
    const cur = Number(current.ventas_total);
    const prev = Number(previous.ventas_total);
    return ((cur - prev) / prev) * 100;
  }, [current, previous]);

  const maxDia = useMemo(() => {
    if (!current?.por_dia?.length) return 0;
    return Math.max(...current.por_dia.map((d) => Number(d.ventas)));
  }, [current]);

  return (
    <>
      <SectionTitle
        eyebrow="Solo administracion"
        title="Ventas del mes"
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Mes anterior"
              className="rounded-control border border-line p-2 text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <CaretLeftIcon size={14} weight="bold" />
            </button>
            <span className="min-w-[9rem] text-center text-[14px] capitalize">
              {monthName(month)} {year}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Mes siguiente"
              className="rounded-control border border-line p-2 text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <CaretRightIcon size={14} weight="bold" />
            </button>
          </div>
        }
      />

      <ErrorNote message={error} />

      {loading || !current ? (
        <Card index={0}>
          <p className="text-[14px] text-muted">Cargando...</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" index={0}>
              <Stat
                label="Total vendido en el mes"
                value={Number(current.ventas_total)}
                size="lg"
                hint={`${current.tickets} ventas registradas`}
              />

              {variacion !== null ? (
                <p className="mt-5">
                  <Tag tone={variacion >= 0 ? "efectivo" : "credito"}>
                    {variacion >= 0 ? "+" : ""}
                    {variacion.toFixed(1)}% contra {monthName(month === 1 ? 12 : month - 1)}
                  </Tag>
                </p>
              ) : null}

              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
                <div>
                  <dt className="mb-1.5">
                    <Tag tone="efectivo">Efectivo</Tag>
                  </dt>
                  <dd className="num text-lg">{money(current.ventas_efectivo)}</dd>
                </div>
                <div>
                  <dt className="mb-1.5">
                    <Tag tone="sinpe">Sinpe</Tag>
                  </dt>
                  <dd className="num text-lg">{money(current.ventas_sinpe)}</dd>
                </div>
                <div>
                  <dt className="mb-1.5">
                    <Tag tone="tarjeta">Tarjeta</Tag>
                  </dt>
                  <dd className="num text-lg">{money(current.ventas_tarjeta)}</dd>
                </div>
              </dl>
            </Card>

            <div className="grid gap-4">
              <Card index={1}>
                <Stat
                  label="Neto del mes"
                  value={Number(current.neto)}
                  hint={`Menos ${money(current.gastos_total)} de gastos`}
                />
              </Card>
              <Card index={2}>
                <Stat
                  label="Consumo a credito"
                  value={Number(current.consumo_credito)}
                  tone="credito"
                  hint="Fiado del mes. Entra como venta al cobrarse."
                />
              </Card>
            </div>

            <Card index={3}>
              <Stat label="Mostrador" value={Number(current.ventas_mostrador)} />
            </Card>
            <Card index={4}>
              <Stat label="Abonos cobrados" value={Number(current.abonos_cobrados)} />
            </Card>
            <Card index={5}>
              <Stat label="Gastos" value={Number(current.gastos_total)} tone="muted" />
            </Card>
          </div>

          <div className="mt-16">
            <h2 className="eyebrow mb-5">Dia por dia</h2>
            {current.por_dia.length === 0 ? (
              <Empty>Sin ventas en el mes.</Empty>
            ) : (
              <ul className="border-t border-line">
                {current.por_dia.map((d, i) => {
                  const ventas = Number(d.ventas);
                  const width = maxDia > 0 ? (ventas / maxDia) * 100 : 0;
                  return (
                    <li
                      key={d.d}
                      className="reveal flex items-center gap-4 border-b border-line py-3"
                      style={{ ["--index" as string]: Math.min(i, 15) }}
                    >
                      <span className="num w-14 shrink-0 text-[12px] text-muted">
                        {shortDate(d.d)}
                      </span>

                      {/* Barra sobria: solo ancho relativo, sin color de marca. */}
                      <span className="h-1.5 flex-1 rounded-full bg-surface">
                        <span
                          className="block h-full rounded-full bg-ink/80"
                          style={{ width: `${width}%` }}
                        />
                      </span>

                      <span className="num w-24 shrink-0 text-right text-[12px] text-muted">
                        -{money(d.gastos)}
                      </span>
                      <span className="num w-28 shrink-0 text-right text-[15px]">
                        {money(ventas)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
