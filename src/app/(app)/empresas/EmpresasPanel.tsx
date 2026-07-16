"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import {
  deleteCompany,
  deleteEmployee,
  upsertCompany,
  upsertEmployee,
} from "@/lib/rpc";
import type { Company, CompanyEmployee } from "@/lib/types";
import { Card, Empty, ErrorNote, Modal, SectionTitle, Tag } from "@/components/ui";

type Dialog =
  | { kind: "empresa"; company: Company | null }
  | { kind: "empleado"; companyId: string; employee: CompanyEmployee | null }
  | { kind: "borrar-empresa"; company: Company }
  | { kind: "borrar-empleado"; employee: CompanyEmployee }
  | null;

export default function EmpresasPanel({
  companies,
  employees,
}: {
  companies: Company[];
  employees: CompanyEmployee[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleEmployee(e: CompanyEmployee) {
    setError(null);
    try {
      await upsertEmployee(e.id, e.company_id, e.name, !e.active);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleCompany(c: Company) {
    setError(null);
    try {
      await upsertCompany(c.id, c.name, !c.active);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow="Cuentas por cobrar"
        title="Empresas"
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setDialog({ kind: "empresa", company: null })}
          >
            <PlusIcon size={16} weight="bold" />
            Nueva empresa
          </button>
        }
      />

      <p className="mb-10 max-w-2xl text-[14px] leading-relaxed text-muted">
        Un empleado o una empresa sin movimientos se puede eliminar. Si ya tiene historial
        no, porque sus abonos son ventas registradas: en ese caso se le da de baja. Quien
        quede debiendo sigue apareciendo en Creditos hasta que pague, aunque este de baja.
      </p>

      <ErrorNote message={error} />

      {companies.length === 0 ? (
        <Empty>Todavia no hay empresas. Cree la primera para poder fiar.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {companies.map((company, i) => {
            const staff = employees.filter((e) => e.company_id === company.id);
            return (
              <Card key={company.id} index={i}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-2xl tracking-[-0.02em]">
                      {company.name}
                    </h2>
                    <p className="mt-1 text-[13px] text-muted">
                      {staff.filter((s) => s.active).length} activos de {staff.length}
                    </p>
                  </div>
                  {!company.active ? <Tag tone="credito">Inactiva</Tag> : null}
                </div>

                <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1">
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "empresa", company })}
                    className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCompany(company)}
                    className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    {company.active ? "Desactivar" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "borrar-empresa", company })}
                    className="text-[12px] text-muted underline-offset-4 hover:text-credito-fg hover:underline"
                  >
                    Eliminar
                  </button>
                </div>

                {staff.length === 0 ? (
                  <p className="border-t border-line py-6 text-center text-[13px] text-muted">
                    Sin empleados.
                  </p>
                ) : (
                  <ul className="border-t border-line">
                    {staff.map((e) => (
                      <li
                        key={e.id}
                        className="group flex items-center gap-3 border-b border-line py-2.5"
                      >
                        <span
                          className={`flex-1 text-[14px] ${
                            e.active ? "" : "text-muted line-through"
                          }`}
                        >
                          {e.name}
                        </span>

                        <div className="flex shrink-0 gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({
                                kind: "empleado",
                                companyId: company.id,
                                employee: e,
                              })
                            }
                            className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                          >
                            Renombrar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleEmployee(e)}
                            className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                          >
                            {e.active ? "Dar de baja" : "Reactivar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "borrar-empleado", employee: e })}
                            className="text-[12px] text-muted underline-offset-4 hover:text-credito-fg hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setDialog({ kind: "empleado", companyId: company.id, employee: null })
                  }
                  className="mt-5 text-[13px] text-ink underline underline-offset-4"
                >
                  Agregar empleado
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <NombreModal
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDone={() => router.refresh()}
      />

      <BorrarModal
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function NombreModal({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  if (dialog?.kind !== "empresa" && dialog?.kind !== "empleado") return null;

  const esEmpresa = dialog.kind === "empresa";
  const existing = esEmpresa ? dialog.company : dialog.employee;

  // El campo arranca con el nombre actual y deja de pisarse apenas el usuario teclea.
  const value = touched ? name : (existing?.name ?? "");

  function close() {
    setName("");
    setTouched(false);
    setError(null);
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("El nombre no puede quedar vacio.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (dialog!.kind === "empresa") {
        await upsertCompany(
          dialog!.company?.id ?? null,
          trimmed,
          dialog!.company?.active ?? true,
        );
      } else if (dialog!.kind === "empleado") {
        await upsertEmployee(
          dialog!.employee?.id ?? null,
          dialog!.companyId,
          trimmed,
          dialog!.employee?.active ?? true,
        );
      }
      onDone();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = esEmpresa
    ? existing
      ? "Renombrar empresa"
      : "Nueva empresa"
    : existing
      ? "Renombrar empleado"
      : "Nuevo empleado";

  return (
    <Modal open onClose={close} title={title}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="nombre" className="eyebrow block">
            Nombre
          </label>
          <input
            id="nombre"
            className="field"
            placeholder={esEmpresa ? "El Cedral" : "Marvin Rojas"}
            value={value}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
            required
          />
        </div>

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BorrarModal({
  dialog,
  onClose,
  onDone,
}: {
  dialog: Dialog;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (dialog?.kind !== "borrar-empresa" && dialog?.kind !== "borrar-empleado") return null;

  const esEmpresa = dialog.kind === "borrar-empresa";
  const nombre =
    dialog.kind === "borrar-empresa" ? dialog.company.name : dialog.employee.name;

  function close() {
    setError(null);
    onClose();
  }

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      if (dialog!.kind === "borrar-empresa") {
        await deleteCompany(dialog!.company.id);
      } else if (dialog!.kind === "borrar-empleado") {
        await deleteEmployee(dialog!.employee.id);
      }
      onDone();
      close();
    } catch (err) {
      // La base rechaza el borrado si hay historial y explica por que.
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={close} title={esEmpresa ? "Eliminar empresa" : "Eliminar empleado"}>
      <div className="space-y-5">
        <p className="text-[15px] leading-relaxed">
          Se va a eliminar <span className="font-medium">{nombre}</span>
          {esEmpresa ? " y sus empleados" : ""}. Esto no se puede deshacer.
        </p>

        <p className="text-[13px] leading-relaxed text-muted">
          Si ya tiene movimientos registrados, el sistema no lo va a permitir: sus abonos
          son ventas del historial. En ese caso {esEmpresa ? "desactive la empresa" : "dele de baja"}.
        </p>

        <ErrorNote message={error} />

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn flex-1 bg-credito-fg text-paper hover:opacity-90"
          >
            {busy ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
