import React from "react";
import { createRoot } from "react-dom/client";
import { PhoneApp } from "./PhoneApp";
import "./styles/index.css";
import "./styles/wand.css";
import "./styles/dock.css";
import "./styles/spellmenu.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PhoneApp />
  </React.StrictMode>,
);
