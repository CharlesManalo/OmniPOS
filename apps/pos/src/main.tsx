import React from "react";
import { createRoot } from "react-dom/client";
import { initializeBridge } from "../../../packages/ui/api";
import { PosApp } from "./App";
import "../../../packages/ui/styles.css";
await initializeBridge("pos");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PosApp />
  </React.StrictMode>,
);
