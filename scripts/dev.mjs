import { createServer } from "vite";
import { spawn } from "node:child_process";
import electron from "electron";
import { buildMain } from "./build.mjs";
const kind = process.argv[2] ?? "pos";
await buildMain(kind);
const server = await createServer({ mode: kind });
await server.listen();
server.printUrls();
if (process.argv.includes("--browser")) {
  console.log(
    "Browser preview uses labeled sample data. Desktop authorization is not bypassed.",
  );
} else {
  const env = {
    ...process.env,
    OMNIPOS_DEV_URL: `http://127.0.0.1:${kind === "developer" ? 5174 : 5173}`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [`dist/${kind}/main.cjs`], {
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  child.on("exit", async (code) => {
    await server.close();
    process.exit(code ?? 0);
  });
}
