import React from "react";
import { createRoot } from "react-dom/client";
import { initializeBridge } from "../../../packages/ui/api";
import { DeveloperApp } from "./App";
import "../../../packages/ui/styles.css";
await initializeBridge("developer");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DeveloperApp />
  </React.StrictMode>,
);
