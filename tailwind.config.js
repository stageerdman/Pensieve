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
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "calc(var(--radius) + 4px)",
      },
    },
  },
  plugins: [],
};
