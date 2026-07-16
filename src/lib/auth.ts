import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Guard de todas las paginas privadas. Redirige al login si no hay sesion. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) redirect("/login");
  return profile as Profile;
}

/** Guard de las pantallas exclusivas del admin (ventas mensuales, empresas).
 *  El bloqueo de verdad lo hacen RLS y los RPC; esto evita mostrar la pantalla. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
