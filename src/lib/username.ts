/**
 * El usuario nunca escribe un correo: teclea "admin" o "cobrador".
 * Por debajo Supabase Auth usa un correo sintetico en este dominio.
 *
 * Vive aparte de auth.ts porque el formulario de login es un client component
 * y auth.ts arrastra next/headers, que solo existe en el servidor.
 */
export const USERNAME_DOMAIN = "fogon.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}
