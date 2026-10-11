// Phone PostCSS — explicitly points Tailwind at the phone config (cwd is the repo root
// when the npm scripts run, so the path is repo-relative).
export default {
  plugins: {
    tailwindcss: { config: "./phone/tailwind.config.js" },
    autoprefixer: {},
  },
};
