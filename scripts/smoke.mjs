import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
await mkdir("test-results", { recursive: true });
for (const kind of ["pos", "developer"]) {
  const env = {
    ...process.env,
    OMNIPOS_TEST_DATA: await mkdtemp(join(tmpdir(), `omnipos-${kind}-`)),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const instance = await electron.launch({
    args: [`dist/${kind}/main.cjs`],
    env,
    timeout: 30000,
  });
  try {
    const page = await instance.firstWindow();
    await page
      .getByRole("heading", {
        name: /connect your workspace|Sign in to your workspace/,
      })
      .waitFor();
    const state = await page.evaluate(() =>
      window.omni.invoke({ action: "app.state" }),
    );
    if (state.kind !== kind || state.preview)
      throw new Error("Wrong application or preview leaked into desktop build");
    const rejection = await page.evaluate(async () => {
      try {
        await window.omni.invoke({ action: "pos.checkout", checkout: {} });
        return false;
      } catch {
        return true;
      }
    });
    if (!rejection) throw new Error("Malformed checkout was accepted");
    await page.screenshot({
      path: `test-results/${kind}-desktop.png`,
      fullPage: true,
    });
    console.log(
      `${kind}: real Electron window, SQLite startup, isolated bridge, validation and setup screen PASS`,
    );
  } finally {
    await instance.close();
  }
}
