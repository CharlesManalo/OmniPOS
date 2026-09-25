import electron from "electron";
import { spawnSync } from "node:child_process";
const result = spawnSync(
  electron,
  [
    "-e",
    "const Database=require('better-sqlite3');const db=new Database(':memory:');console.log('Electron native SQLite:',db.prepare('select sqlite_version() version').get().version);db.close();",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  },
);
if (result.status !== 0)
  throw new Error(
    "Native SQLite failed verification in the installed Electron runtime",
  );
