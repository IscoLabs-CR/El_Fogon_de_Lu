"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Red de seguridad general: si una pagina (o el layout privado) lanza una
 * excepcion no controlada -por ejemplo, un RPC de Supabase que falla por red-
 * esto evita la pantalla generica de Next y ofrece reintentar o volver al inicio.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="card w-full max-w-sm p-8 text-center">
        <p className="eyebrow mb-3">Algo fallo</p>
        <h1 className="mb-4 font-serif text-2xl tracking-[-0.02em]">
          No se pudo cargar la pagina
        </h1>
        <p className="mb-8 text-[14px] leading-relaxed text-muted">
          Puede ser un problema pasajero de conexion con la base de datos. Intente de
          nuevo; si sigue fallando, avise al administrador.
        </p>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={() => reset()}>
            Reintentar
          </button>
          <Link href="/" className="btn-primary flex-1">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
