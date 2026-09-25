import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
for (const kind of ["pos", "developer"]) {
  const response = await fetch(
    `https://github.com/CharlesManalo/OmniPOS/releases/latest/download/${kind}.yml`,
    { signal: AbortSignal.timeout(30_000) },
  );
  assert.equal(response.status, 200);
  const remote = load(await response.text());
  const local = load(await readFile(`release/${kind}/${kind}.yml`, "utf8"));
  assert.equal(remote.version, version);
  assert.equal(remote.sha512, local.sha512);
  assert.deepEqual(remote.omniposPolicy, local.omniposPolicy);
  console.log(
    `Public ${kind}.yml: version, installer hash and update policy verified.`,
  );
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const [name, file] of [
  ["current", "release/pos/win-unpacked/OmniPOS.exe"],
  ["baseline", "test-results/baseline-pos-0.1.0/OmniPOS.exe"],
]) {
  const app = await electron.launch({ executablePath: resolve(file), env });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Sign in to your workspace" })
      .waitFor();
    const state = await page.evaluate(() =>
      window.omni.invoke({ action: "update.check" }),
    );
    assert.equal(state.status, name === "current" ? "current" : "available");
    if (name === "baseline") {
      assert.equal(state.version, version);
      const downloaded = await page.evaluate(() =>
        window.omni.invoke({ action: "update.download" }),
      );
      assert.equal(downloaded.status, "ready");
      console.log(
        `Actual 0.1.0 packaged app detected and downloaded ${version} from GitHub with installer integrity verification. Install was not triggered on this workstation.`,
      );
    } else
      console.log(
        `Actual ${version} packaged app successfully checked GitHub and reports up to date.`,
      );
  } finally {
    await app.close();
  }
}
