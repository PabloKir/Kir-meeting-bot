import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        kir: {
          negro: "#222222",
          gris: "#98989A",
          "gris-claro": "#F2F2F2",
          "gris-papel": "#FAFAFA",
          "gris-border": "#E2E2E2",
          blanco: "#FFFFFF",
          teal: "#006B68",
          "teal-dark": "#004F4D",
          "teal-soft": "#E6F0EF",
          rojo: "#B23A2C",
          amber: "#B8860B",
        },
      },
      fontFamily: {
        display: ['"Archivo"', "Helvetica Neue", "sans-serif"],
        body: ['"Roboto"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.025em",
        eyebrow: "0.22em",
      },
      borderRadius: {
        none: "0",
      },
    },
  },
  plugins: [],
};

export default config;
