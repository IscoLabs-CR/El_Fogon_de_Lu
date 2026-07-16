const CRC = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Montos siempre en colones enteros: en la soda no se cobran centimos. */
export function money(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return CRC.format(Number.isFinite(n) ? n : 0);
}

/** Sin simbolo, para tablas donde la columna ya dice que es plata. */
export function amount(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** Las fechas de negocio llegan como 'YYYY-MM-DD'. Se parsean a mano para que el
 *  navegador no las corra un dia al interpretarlas como UTC. */
function parseBusinessDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function longDate(iso: string): string {
  const d = parseBusinessDate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

export function shortDate(iso: string): string {
  const d = parseBusinessDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthName(monthIndex1: number): string {
  return MONTHS[monthIndex1 - 1] ?? "";
}

/** Hora local de Costa Rica a partir de un timestamptz. */
export function clock(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
}

/** Fecha operativa de hoy en Costa Rica, como 'YYYY-MM-DD'. */
export function todayCR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
