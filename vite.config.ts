/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// Wall-clock benchmarks only mean something on a quiet machine, alone: they stay out of
// `npm test` (parallel, so timings swing) and run by themselves with `npm run bench`.
const BENCH = "**/*.bench.test.ts";

// Vite config. The dev server runs the same frontend the Tauri webview loads,
// so we can build and verify the whole writing experience in the browser first.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Agent worktrees live under .claude/worktrees — never run their copies of the suite.
    exclude: [...configDefaults.exclude, ".claude/**", ...(mode === "bench" ? [] : [BENCH])],
    ...(mode === "bench" ? { include: [BENCH] } : {}),
  },
}));
