import type { MetadataRoute } from "next";

/**
 * Web App Manifest. Next lo sirve en /manifest.webmanifest y agrega el
 * <link rel="manifest"> solo. Es lo que hace que el navegador ofrezca
 * "Instalar" en escritorio y "Agregar a pantalla de inicio" en el celular.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "El Hornito de Lu",
    short_name: "El Hornito",
    description: "Control de ventas, caja y cuentas por cobrar.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F6F3",
    theme_color: "#221812",
    lang: "es",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
