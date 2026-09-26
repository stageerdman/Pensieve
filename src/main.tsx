import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { log } from "./lib/logger";
import "./index.css";

log.info("app", "boot", "Pensieve starting");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
