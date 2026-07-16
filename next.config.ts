import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Origenes de Supabase permitidos en connect-src: REST/Auth por https y Realtime
 * por wss. Se leen del entorno en vez de escribirse a mano, para que la CSP siga
 * al proyecto si cambia la URL. Si la variable falta al compilar, se cae al
 * comodin de supabase.co: una CSP algo mas ancha, pero nunca una app rota.
 */
function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const { origin, host } = new URL(url);
    return `${origin} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

/**
 * La app no carga nada de terceros: next/font autohospeda las tipografias al
 * compilar y no hay CDN, ni iframes, ni imagenes remotas. Por eso todo cuelga de
 * 'self' y la unica excepcion es Supabase en connect-src.
 *
 * 'unsafe-inline' en script-src es una concesion al App Router, que inyecta el
 * bootstrap y el payload RSC como <script> inline. Quitarlo exige emitir un nonce
 * por request desde el proxy; queda anotado como endurecimiento pendiente. Aun
 * con esa concesion, la CSP sigue cerrando exfiltracion (connect-src), clickjacking
 * (frame-ancestors), secuestro de formularios (form-action), reescritura de rutas
 * relativas (base-uri) y plugins (object-src).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // next/font emite un <style> inline y las tarjetas usan style={{ --index }}.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins()}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // X-Frame-Options: DENY rompe la vista previa movil en desarrollo.
    if (!isProd) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
