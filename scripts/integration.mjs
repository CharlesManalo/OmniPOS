// Actual Electron + SQLite + encrypted storage + signed licenses, with a controlled test server.
// Generated keys/config live only in test-results; neither application ships a test bypass.
import { createServer } from "node:http";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdtemp, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { _electron as electron, expect } from "@playwright/test";
import { SignJWT, importPKCS8 } from "jose";
const userId = randomUUID(),
  tenantId = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const key = await importPKCS8(privateKey, "EdDSA");
let mode = "active",
  leaseSeconds = 3600,
  role = "owner";
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const respond = (data, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  const user = {
    id: userId,
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  if (req.url.startsWith("/auth/v1/token")) {
    const accessToken = await new SignJWT({
      sub: userId,
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    return respond({
      access_token: accessToken,
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  }
  if (req.url.startsWith("/auth/v1/user")) return respond(user);
  if (req.url.startsWith("/auth/v1/logout")) return respond({});
  if (mode === "offline") return respond({ error: "Temporary outage" }, 503);
  if (mode === "disabled")
    return respond({ error: "Subscription disabled" }, 403);
  if (body.action === "license.issue") {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      tenantId,
      userId,
      deviceId: body.deviceId,
      tenantName: "Integration Store",
      role,
      modules: ["pos", "inventory", "reports", "gcash"],
      version: 1,
      paidUntil: now + 86400,
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer("omnipos")
      .setAudience("omnipos-pos")
      .setIssuedAt(now)
      .setExpirationTime(now + leaseSeconds)
      .sign(key);
    return respond({ token });
  }
  if (body.action === "pos.backup")
    return respond({ ids: body.entries.map((e) => e.sale.id) });
  respond({ error: "Unknown test endpoint" }, 404);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const testDir = resolve("test-results/integration");
await mkdir(testDir, { recursive: true });
const config = {
  supabaseUrl: `http://127.0.0.1:${server.address().port}`,
  publishableKey: "test-publishable",
  licensePublicKey: Buffer.from(publicKey).toString("base64"),
  githubOwner: "CharlesManalo",
  githubRepo: "OmniPOS",
  publisher: "",
};
await build({
  entryPoints: ["packages/desktop/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: join(testDir, "main.cjs"),
  external: ["electron", "better-sqlite3", "electron-updater"],
  define: { __APP_KIND__: '"pos"', __APP_CONFIG__: JSON.stringify(config) },
});
await cp("dist/pos/preload.cjs", join(testDir, "preload.cjs"));
await cp("dist/pos/renderer", join(testDir, "renderer"), { recursive: true });
const env = {
  ...process.env,
  OMNIPOS_TEST_DATA: await mkdtemp(join(tmpdir(), "omnipos-integration-")),
};
delete env.ELECTRON_RUN_AS_NODE;
let instance;
try {
  instance = await electron.launch({ args: [join(testDir, "main.cjs")], env });
  let page = await instance.firstWindow();
  const invoke = (command) =>
    page.evaluate((command) => window.omni.invoke(command), command);
  await page
    .getByRole("heading", { name: "Sign in to your workspace" })
    .waitFor();
  const login = await invoke({
    action: "auth.login",
    credentials: { email: "test@example.com", password: "test-password" },
  });
  expect(login.license.tenantId).toBe(tenantId);
  const product = {
    id: randomUUID(),
    name: "Integration coffee",
    barcode: "0042",
    category: "Drink",
    price: 10000,
    stock: 10,
  };
  await invoke({ action: "pos.product", product });
  const checkout = {
    id: randomUUID(),
    items: [{ productId: product.id, quantity: 2 }],
    method: "gcash",
    tendered: 20000,
    reference: "0042",
  };
  const sale = await invoke({ action: "pos.checkout", checkout });
  expect(sale.reference).toBe("0042");
  await invoke({ action: "pos.checkout", checkout });
  expect((await invoke({ action: "pos.state" })).products[0].stock).toBe(8);
  expect((await invoke({ action: "pos.sync" })).synced).toBe(1);
  mode = "offline";
  await invoke({ action: "license.refresh" });
  expect((await invoke({ action: "app.state" })).license).not.toBeNull();
  await invoke({
    action: "pos.checkout",
    checkout: { ...checkout, id: randomUUID() },
  });
  await instance.close();
  instance = null;
  instance = await electron.launch({ args: [join(testDir, "main.cjs")], env });
  page = await instance.firstWindow();
  await page
    .getByRole("heading", { name: "Let’s make a good sale." })
    .waitFor();
  expect((await invoke({ action: "pos.state" })).products[0].stock).toBe(6);
  console.log(
    "Electron integration: encrypted offline restart, exact GCash reference, duplicate checkout and cloud outbox PASS",
  );
  mode = "disabled";
  await invoke({ action: "license.refresh" });
  expect((await invoke({ action: "app.state" })).license).toBeNull();
  await expect(
    invoke({
      action: "pos.checkout",
      checkout: { ...checkout, id: randomUUID() },
    }),
  ).rejects.toThrow();
  mode = "active";
  role = "cashier";
  await invoke({ action: "license.refresh" });
  await expect(invoke({ action: "pos.product", product })).rejects.toThrow(
    /access/,
  );
  await expect(invoke({ action: "admin.list" })).rejects.toThrow(/unavailable/);
  leaseSeconds = 2;
  await invoke({ action: "license.refresh" });
  mode = "offline";
  await expect
    .poll(async () => (await invoke({ action: "app.state" })).license, {
      timeout: 5000,
      intervals: [500],
    })
    .toBeNull();
  console.log(
    "Electron integration: remote disable, re-enable, role checks, app separation and offline expiry PASS",
  );
  mode = "active";
  role = "owner";
  leaseSeconds = 3600;
  await invoke({ action: "license.refresh" });
  const openSale = await invoke({ action: "pos.beginSale" });
  await instance.evaluate(() => {
    // Test only: emit the release event on the real updater singleton, without changing the production build.
    const requireModule = process
      .getBuiltinModule("node:module")
      .createRequire(process.cwd() + "/package.json");
    const updater = requireModule("electron-updater").autoUpdater;
    updater.emit("update-available", {
      version: "99.0.0",
      omniposPolicy: {
        schemaVersion: 1,
        mode: "required",
        minimumVersion: "99.0.0",
      },
      releaseNotes: "Integration test only",
    });
  });
  expect((await invoke({ action: "app.state" })).update.required).toBe(true);
  await expect(invoke({ action: "pos.beginSale" })).rejects.toThrow(
    /required/i,
  );
  await expect(
    invoke({
      action: "pos.checkout",
      checkout: { ...checkout, id: randomUUID() },
    }),
  ).rejects.toThrow(/required/i);
  await invoke({
    action: "pos.checkout",
    checkout: { ...checkout, id: openSale.id },
  });
  // An acknowledged sale can safely be retried, but a new sale cannot start.
  await invoke({
    action: "pos.checkout",
    checkout: { ...checkout, id: openSale.id },
  });
  await expect(invoke({ action: "pos.product", product })).rejects.toThrow(
    /required/i,
  );
  await instance.close();
  instance = null;
  instance = await electron.launch({ args: [join(testDir, "main.cjs")], env });
  page = await instance.firstWindow();
  await page
    .getByRole("heading", {
      name: "A required update is ready for your workspace.",
    })
    .waitFor();
  await expect(invoke({ action: "pos.beginSale" })).rejects.toThrow(
    /required/i,
  );
  console.log(
    "Electron integration: required-update gate allows only the already-open sale and survives restart PASS",
  );
} finally {
  if (instance) await instance.close();
  await new Promise((r) => server.close(r));
}
