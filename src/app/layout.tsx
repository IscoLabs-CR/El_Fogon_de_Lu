import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "El Fogon de Lu",
  description: "Control de ventas, caja y cuentas por cobrar.",
  // Permite instalar la app en iOS con su propia pantalla (sin barra de Safari).
  appleWebApp: {
    capable: true,
    title: "El Fogón de Lu",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#221812",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body>
        <div className="ambient" aria-hidden />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
