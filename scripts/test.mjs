import electron from "electron";
import { spawn } from "node:child_process";
const child = spawn(electron, ["node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
