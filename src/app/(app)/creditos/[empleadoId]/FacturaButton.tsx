"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { ReceiptIcon, DownloadSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { getEmployeeStatement } from "@/lib/rpc";
import { money, todayCR } from "@/lib/format";
import { PAYMENT_LABEL, type StatementRow } from "@/lib/types";
import { buildXlsx, type Cell } from "@/lib/xlsx";
import { Modal, ErrorNote } from "@/components/ui";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy', sin que el navegador corra la fecha un dia. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// La capacidad de compartir archivos (sobre todo movil) no cambia en la sesion, asi
// que se detecta una vez. useSyncExternalStore la lee sin efecto ni desajuste de
// hidratacion: en el servidor da false; en el cliente, lo que soporte el navegador.
let shareCache: boolean | undefined;
function detectFileShare(): boolean {
  if (shareCache !== undefined) return shareCache;
  try {
    const probe = new File(["x"], "x.xlsx", { type: XLSX_MIME });
    shareCache =
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [probe] });
  } catch {
    shareCache = false;
  }
  return shareCache;
}

/** Deja el nombre apto para un nombre de archivo en cualquier sistema. */
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export default function FacturaButton({
  employeeId,
  employeeName,
  companyName,
  currentBalance,
}: {
  employeeId: string;
  employeeName: string;
  companyName: string;
  currentBalance: number;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const canShareFiles = useSyncExternalStore(
    () => () => {}, // la capacidad no cambia: nada a que suscribirse
    detectFileShare, // cliente
    () => false, // servidor
  );

  // Al abrir se trae el estado de cuenta completo (no los 100 de la pantalla), para
  // que el rango de fechas cubra todo el historial vivo.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployeeStatement(employeeId, 5000);
      setRows(data);
      const today = todayCR();
      const fechas = data.map((r) => r.fecha.slice(0, 10));
      const min = fechas.length ? fechas.reduce((a, b) => (a < b ? a : b)) : today.slice(0, 8) + "01";
      setDesde(min);
      setHasta(today);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  function onOpen() {
    setOpen(true);
    setError(null);
    void load();
  }

  const rangoValido = desde !== "" && hasta !== "" && desde <= hasta;

  const enRango = (rows ?? [])
    .filter((r) => {
      const f = r.fecha.slice(0, 10);
      return f >= desde && f <= hasta;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha)); // ascendente para la factura

  const consumido = enRango
    .filter((r) => r.tipo === "cargo")
    .reduce((s, r) => s + Number(r.monto), 0);
  const abonado = enRango
    .filter((r) => r.tipo === "abono")
    .reduce((s, r) => s + Number(r.monto), 0);

  function buildFile(): { blob: Blob; filename: string } {
    const hoy = todayCR();
    const rowsXlsx: Cell[][] = [
      [{ text: "El Fogon de Lu", style: "title" }],
      [{ text: "Estado de cuenta", style: "subtitle" }],
      [],
      [{ text: "Cliente:", style: "label" }, employeeName],
      [{ text: "Empresa:", style: "label" }, companyName],
      [{ text: "Periodo:", style: "label" }, `${fmtDate(desde)} a ${fmtDate(hasta)}`],
      [{ text: "Emitido:", style: "label" }, fmtDate(hoy)],
      [],
      [
        { text: "Fecha", style: "header" },
        { text: "Detalle", style: "header" },
        { text: "Tipo", style: "header" },
        { text: "Metodo", style: "header" },
        { text: "Monto", style: "header" },
      ],
      ...enRango.map((r): Cell[] => [
        fmtDate(r.fecha),
        r.descripcion || (r.tipo === "abono" ? "Abono" : "Consumo"),
        r.tipo === "abono" ? "Abono" : "Consumo",
        r.metodo ? PAYMENT_LABEL[r.metodo] : "",
        // Consumo suma deuda (+), abono la baja (-): neto = saldo del periodo.
        { number: r.tipo === "abono" ? -Number(r.monto) : Number(r.monto), style: "money" },
      ]),
      [],
      [null, null, null, { text: "Consumido en el periodo", style: "label" }, { number: consumido, style: "money" }],
      [null, null, null, { text: "Abonado en el periodo", style: "label" }, { number: abonado, style: "money" }],
      [null, null, null, { text: "Saldo pendiente", style: "label" }, { number: currentBalance, style: "moneyBold" }],
    ];

    const bytes = buildXlsx({
      sheetName: "Estado de cuenta",
      colWidths: [12, 40, 12, 14, 14],
      merges: ["A1:E1", "A2:E2"],
      rows: rowsXlsx,
    });

    const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
    const filename = `Factura-${slug(employeeName)}-${desde}-a-${hasta}.xlsx`;
    return { blob, filename };
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function download() {
    setError(null);
    try {
      const { blob, filename } = buildFile();
      triggerDownload(blob, filename);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function share() {
    setError(null);
    let built: { blob: Blob; filename: string };
    try {
      built = buildFile();
    } catch (e) {
      setError((e as Error).message);
      return;
    }

    const file = new File([built.blob], built.filename, { type: XLSX_MIME });
    setBusy(true);
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Factura ${employeeName}`,
          text: `Estado de cuenta de ${employeeName} (${companyName}) del ${fmtDate(desde)} al ${fmtDate(hasta)}.`,
        });
      } else {
        triggerDownload(built.blob, built.filename);
      }
    } catch (e) {
      // AbortError = el usuario cerro la hoja de compartir: no es un fallo.
      // Cualquier otro caso (compartir bloqueado en escritorio o sin HTTPS): se
      // descarga el archivo para que el usuario no quede sin nada.
      if ((e as Error).name !== "AbortError") triggerDownload(built.blob, built.filename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={onOpen}>
        <ReceiptIcon size={16} weight="bold" />
        Factura
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Generar factura">
        {loading ? (
          <p className="py-8 text-center text-[14px] text-muted">Cargando movimientos...</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-control border border-line bg-surface p-4">
              <p className="text-[15px]">{employeeName}</p>
              <p className="mt-1 text-[13px] text-muted">{companyName}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="fac-desde" className="eyebrow block">
                  Desde
                </label>
                <input
                  id="fac-desde"
                  type="date"
                  className="field"
                  value={desde}
                  max={hasta || undefined}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="fac-hasta" className="eyebrow block">
                  Hasta
                </label>
                <input
                  id="fac-hasta"
                  type="date"
                  className="field"
                  value={hasta}
                  min={desde || undefined}
                  max={todayCR()}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-control border border-line p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted">Movimientos en el rango</span>
                <span className="num">{enRango.length}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="text-muted">Consumido</span>
                <span className="num">{money(consumido)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="text-muted">Abonado</span>
                <span className="num">{money(abonado)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[13px]">
                <span className="text-muted">Saldo pendiente</span>
                <span className="num text-credito-fg">{money(currentBalance)}</span>
              </div>
            </div>

            {!rangoValido ? (
              <p className="text-[13px] text-muted">La fecha inicial no puede ser mayor que la final.</p>
            ) : enRango.length === 0 ? (
              <p className="text-[13px] text-muted">No hay movimientos en este rango de fechas.</p>
            ) : null}

            <ErrorNote message={error} />

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={download}
                disabled={!rangoValido || enRango.length === 0}
              >
                <DownloadSimpleIcon size={16} weight="bold" />
                Descargar
              </button>
              {canShareFiles ? (
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={share}
                  disabled={!rangoValido || enRango.length === 0 || busy}
                >
                  <ShareNetworkIcon size={16} weight="bold" />
                  {busy ? "Compartiendo..." : "Compartir"}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
