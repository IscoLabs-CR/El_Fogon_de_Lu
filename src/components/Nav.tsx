"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ListIcon, SignOutIcon, XIcon } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Hoy", adminOnly: false },
  { href: "/caja", label: "Caja", adminOnly: false },
  { href: "/gastos", label: "Gastos", adminOnly: false },
  { href: "/creditos", label: "Creditos", adminOnly: false },
  { href: "/empresas", label: "Empresas", adminOnly: false },
  { href: "/reportes/dia", label: "Dia", adminOnly: false },
  { href: "/reportes/mes", label: "Mes", adminOnly: true },
];

export default function Nav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = LINKS.filter((l) => !l.adminOnly || profile.role === "admin");

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex max-w-shell items-center gap-x-6 px-6 py-4">
        <Link href="/" className="font-serif text-lg tracking-[-0.02em]">
          El Fogon de Lu
        </Link>

        {/* Tabs horizontales: solo en pantallas medianas hacia arriba */}
        <nav className="hidden flex-1 flex-wrap items-center gap-x-1 sm:flex">
          {visible.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-control px-3 py-1.5 text-[13px] transition-colors ${
                  active ? "bg-ink text-paper" : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:ml-0">
          <span className="hidden font-mono text-[11px] uppercase tracking-eyebrow text-muted sm:inline">
            {profile.username}
          </span>
          <button
            type="button"
            onClick={signOut}
            aria-label="Salir"
            className="hidden rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink sm:inline-flex"
          >
            <SignOutIcon size={16} weight="bold" />
          </button>

          {/* Boton de menu: solo en movil */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            className="-mr-1.5 rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink sm:hidden"
          >
            {menuOpen ? (
              <XIcon size={22} weight="bold" />
            ) : (
              <ListIcon size={22} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {/* Panel desplegable movil */}
      {menuOpen ? (
        <nav className="border-t border-line bg-canvas px-4 pb-4 pt-2 sm:hidden">
          <div className="flex flex-col gap-1">
            {visible.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-control px-3 py-2.5 text-[15px] transition-colors ${
                    active ? "bg-ink text-paper" : "text-ink hover:bg-surface"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted">
              {profile.username}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <SignOutIcon size={16} weight="bold" />
              Salir
            </button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
