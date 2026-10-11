/** @type {import('tailwindcss').Config} */
// Tokens are defined as CSS variables in src/index.css (design.md) and mapped
// here so the whole app is themed from one place, light and dark.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-sunken": "hsl(var(--surface-sunken) / <alpha-value>)",
        "surface-raised": "hsl(var(--surface-raised) / <alpha-value>)",
        text: "hsl(var(--text) / <alpha-value>)",
        "text-muted": "hsl(var(--text-muted) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-glow": "hsl(var(--accent-glow) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        warn: "hsl(var(--warn) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        gold: "hsl(var(--gold) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Micro labels / chips / dates / counts — the smallest step in the
        // deliberate type scale (see design.md). Ends the 9/10/11px soup.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
      },
      // One radius scale, all tied to --radius (design.md) so changing the base
      // rescales the whole family. md is kept equal to the base (6px) because it's
      // the workhorse (used ~30×) — no visual shift there.
      borderRadius: {
        sm: "calc(var(--radius) - 2px)", // 4px
        DEFAULT: "var(--radius)", // 6px
        md: "var(--radius)", // 6px
        lg: "calc(var(--radius) + 4px)", // 10px
        xl: "calc(var(--radius) + 8px)", // 14px
        "2xl": "calc(var(--radius) + 14px)", // 20px
      },
    },
  },
  plugins: [],
};
