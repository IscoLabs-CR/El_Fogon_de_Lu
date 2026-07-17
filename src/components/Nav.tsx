"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutIcon } from "@phosphor-icons/react";
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

  const visible = LINKS.filter((l) => !l.adminOnly || profile.role === "admin");

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <Link href="/" className="font-serif text-lg tracking-[-0.02em]">
          El Fogon de Lu
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-x-1">
          {visible.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
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

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[11px] uppercase tracking-eyebrow text-muted sm:inline">
            {profile.username}
          </span>
          <button
            type="button"
            onClick={signOut}
            aria-label="Salir"
            className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <SignOutIcon size={16} weight="bold" />
          </button>
        </div>
      </div>
    </header>
  );
}
