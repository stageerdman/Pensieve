import base from "../tailwind.config.js";

/** @type {import('tailwindcss').Config} */
// Phone PWA Tailwind — reuses the desktop theme verbatim (same token mapping = one
// source of truth) and only re-points the content globs at the phone app.
export default {
  ...base,
  content: ["./phone/index.html", "./phone/src/**/*.{ts,tsx}"],
};
