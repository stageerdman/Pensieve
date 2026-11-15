import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { phoneServiceWorker } from "./vite.swPlugin";

// The phone PWA (The Wand) — its own Vite app under phone/, sharing the design-token
// source of truth with the desktop app via src/styles/tokens.css (imported in CSS).
// Dev: `npm run dev:phone`, then open on the iPhone over the LAN (host:true).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    phoneServiceWorker({
      template: fileURLToPath(new URL("./sw-template.js", import.meta.url)),
      publicDir: fileURLToPath(new URL("./public", import.meta.url)),
    }),
  ],
  clearScreen: false,
  server: { port: 5174, strictPort: true, host: true },
  build: { outDir: "../dist-phone", emptyOutDir: true },
});
