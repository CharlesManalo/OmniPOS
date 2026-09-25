import { _electron as electron } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir("test-results", { recursive: true });
const profiles = [];
for (const kind of ["pos", "developer"]) {
  const slug = kind === "pos" ? "OmniPOS" : "OmniPOS-Developer";
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const instance = await electron.launch({
    executablePath: resolve(`release/${kind}/win-unpacked/${slug}.exe`),
    env,
    timeout: 30_000,
  });
  try {
    const page = await instance.firstWindow();
    await page
      .getByRole("heading", {
        name: /connect your workspace|Sign in to your workspace/,
      })
      .waitFor();
    const runtime = await instance.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged,
      name: app.getName(),
      userData: app.getPath("userData"),
      preferences:
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    }));
    if (!runtime.packaged) throw new Error("Not running a packaged executable");
    const expectedName = kind === "pos" ? "OmniPOS" : "OmniPOS Developer";
    if (runtime.name !== expectedName)
      throw new Error("Wrong application identity");
    const prefs = runtime.preferences;
    if (
      !prefs.sandbox ||
      !prefs.contextIsolation ||
      prefs.nodeIntegration ||
      prefs.devTools
    )
      throw new Error("Packaged window security preferences are incorrect");
    profiles.push(runtime.userData);
    const state = await page.evaluate(() =>
      window.omni.invoke({ action: "app.state" }),
    );
    if (state.kind !== kind || state.preview)
      throw new Error("Wrong app or preview leaked into package");
    const denied = await page.evaluate(async () => {
      try {
        await window.omni.invoke({ action: "pos.checkout", checkout: {} });
        return false;
      } catch {
        return true;
      }
    });
    if (!denied) throw new Error("Packaged IPC accepted an invalid checkout");
    await page.screenshot({
      path: `test-results/${kind}-packaged.png`,
      fullPage: true,
    });
    console.log(
      `${kind}: packaged EXE, SQLite startup, isolated renderer, IPC validation and setup/sign-in screen PASS`,
    );
    if (kind === "developer" && process.argv.includes("--developer-login")) {
      const credentials = JSON.parse(
        await readFile(".secrets/developer-login.json", "utf8"),
      );
      try {
        await page.getByLabel("Email address").fill(credentials.email);
        await page
          .getByLabel("Password", { exact: true })
          .fill(credentials.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Client portfolio", exact: true })
          .waitFor();
        const portfolio = await page.evaluate(() =>
          window.omni.invoke({ action: "admin.list" }),
        );
        if (!Array.isArray(portfolio.tenants))
          throw new Error("Live developer data unavailable");
        await page.screenshot({
          path: "test-results/developer-packaged-live.png",
          fullPage: true,
        });
        console.log(
          "Developer packaged EXE: real UI sign-in and live portfolio PASS",
        );
      } finally {
        await page.evaluate(() =>
          window.omni.invoke({ action: "auth.logout" }),
        );
      }
    }
  } finally {
    await instance.close();
  }
}
if (profiles[0] === profiles[1])
  throw new Error("Developer and POS share a data directory");
console.log("Separate POS and Developer application data directories PASS");
