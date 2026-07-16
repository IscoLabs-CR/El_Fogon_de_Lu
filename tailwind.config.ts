import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monocromo calido. El color es un recurso escaso: solo semantica.
        canvas: "#F7F6F3",
        paper: "#FFFFFF",
        surface: "#F9F9F8",
        line: "#EAEAEA",
        ink: "#111111",
        muted: "#787774",
        // Pasteles apagados: unicamente para metodo de pago y estado.
        efectivo: { bg: "#EDF3EC", fg: "#346538" },
        sinpe: { bg: "#E1F3FE", fg: "#1F6C9F" },
        tarjeta: { bg: "#FBF3DB", fg: "#956400" },
        credito: { bg: "#FDEBEC", fg: "#9F2F2D" },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "SF Pro Display", "Helvetica Neue", "sans-serif"],
        serif: ["var(--font-newsreader)", "Lyon Text", "Georgia", "serif"],
        mono: ["var(--font-geist-mono)", "SF Mono", "monospace"],
      },
      borderRadius: {
        card: "12px",
        control: "6px",
      },
      boxShadow: {
        // Practicamente inexistente. Nunca shadow-md/lg/xl.
        lift: "0 2px 8px rgba(0,0,0,0.04)",
      },
      letterSpacing: {
        eyebrow: "0.08em",
      },
      maxWidth: {
        shell: "1180px",
      },
    },
  },
  plugins: [],
};

export default config;
