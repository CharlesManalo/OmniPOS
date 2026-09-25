import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  session,
  dialog,
} from "electron";
import { join, resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  Command,
  can,
  type AppState,
  type Lease,
  type AdminData,
} from "../domain/contracts";
import { LicenseClock, verifyLicense } from "../domain/license";
import { LocalDatabase } from "./database";
import { Cloud, CloudError, Vault } from "./cloud";
import { Updates } from "./updater";

const kind = __APP_KIND__;
app.setName(kind === "pos" ? "OmniPOS" : "OmniPOS Developer");
app.setPath(
  "userData",
  process.env.OMNIPOS_TEST_DATA && !app.isPackaged
    ? process.env.OMNIPOS_TEST_DATA
    : join(
        app.getPath("appData"),
        kind === "pos" ? "OmniPOS" : "OmniPOS Developer",
      ),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "omni",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let window: BrowserWindow;
let db: LocalDatabase;
let vault: Vault;
let cloud: Cloud;
let updates: Updates;
let clock: LicenseClock;
let user: AppState["user"] = null;
let lease: Lease | null = null;
let signedLease: string | null = null;
let blockedReason: string | null = null;
let online = false;
let deviceId: string;
let activeSaleId: string | null = null;
let completedSaleId: string | null = null;
let refreshing: Promise<void> | null = null;
const missing = [
  !__APP_CONFIG__.publishableKey && "Supabase publishable key",
  !__APP_CONFIG__.licensePublicKey && "License verification public key",
].filter(Boolean) as string[];
const publicKey = Buffer.from(
  __APP_CONFIG__.licensePublicKey,
  "base64",
).toString("utf8");

function clearLicense(reason: string) {
  lease = null;
  signedLease = null;
  vault.remove("lease");
  blockedReason = reason;
}
async function currentLicense() {
  if (!user || !signedLease)
    throw new Error(blockedReason ?? "Sign in with an active client account");
  try {
    lease = await verifyLicense(
      signedLease,
      publicKey,
      { deviceId, userId: user.id },
      clock.now(),
    );
    db.set("clock", String(clock.watermark()));
    return lease;
  } catch (error) {
    lease = null;
    blockedReason = error instanceof Error ? error.message : "License invalid";
    throw new Error("License expired or invalid. Connect to renew access.");
  }
}
async function refreshLicense() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (!user) return;
    const requestedUserId = user.id;
    try {
      const result = await cloud.call<{ token: string }>({
        action: "license.issue",
        deviceId,
      });
      if (user?.id !== requestedUserId) return;
      const verified = await verifyLicense(
        result.token,
        publicKey,
        { deviceId, userId: requestedUserId },
        clock.now(),
      );
      signedLease = result.token;
      lease = verified;
      vault.set("lease", result.token);
      blockedReason = null;
      online = true;
    } catch (error) {
      if (user?.id !== requestedUserId) return;
      online = false;
      if (
        error instanceof CloudError &&
        [400, 401, 403, 404, 409, 410, 422].includes(error.status)
      )
        clearLicense(error.message);
      else if (!signedLease)
        blockedReason =
          error instanceof Error ? error.message : "License unavailable";
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
async function appState(): Promise<AppState> {
  if (kind === "pos" && signedLease) await currentLicense().catch(() => {});
  return {
    kind,
    version: app.getVersion(),
    configured: missing.length === 0,
    missing,
    user,
    license: lease,
    blockedReason,
    online,
    deviceId,
    update: updates.state,
    preview: false,
  };
}
async function authorize(operation: "checkout" | "inventory" | "reports") {
  const lic = await currentLicense();
  const module = operation === "checkout" ? "pos" : operation;
  if (!can(lic.role, operation) || !lic.modules.includes(module))
    throw new Error("Your account does not have access to this feature");
  return lic;
}
async function syncSales() {
  const lic = await currentLicense();
  const pending = db.pending(lic.tenantId);
  if (!pending.length) return { synced: 0 };
  const result = await cloud.call<{ ids: string[] }>({
    action: "pos.backup",
    entries: pending,
  });
  db.acknowledge(lic.tenantId, result.ids);
  return { synced: result.ids.length };
}
async function handle(command: Command): Promise<unknown> {
  if (command.action === "app.state") return appState();
  if (command.action === "auth.login") {
    activeSaleId = null;
    completedSaleId = null;
    if (missing.length)
      throw new Error(`Setup required: ${missing.join(", ")}`);
    if (!cloud.client) throw new Error("Supabase is not configured");
    if (refreshing) await refreshing;
    clearLicense("Signing in");
    user = null;
    vault.remove("identity");
    const { data, error } = await cloud.client.auth.signInWithPassword(
      command.credentials,
    );
    if (error || !data.user)
      throw new Error(error?.message ?? "Sign-in failed");
    user = {
      id: data.user.id,
      email: data.user.email ?? command.credentials.email,
    };
    try {
      if (kind === "developer") {
        await cloud.call<AdminData>({ action: "admin.list" });
        online = true;
      } else await refreshLicense();
      vault.set("identity", JSON.stringify(user));
    } catch (error) {
      await cloud.client.auth.signOut({ scope: "local" });
      user = null;
      throw error;
    }
    return appState();
  }
  if (command.action === "auth.logout") {
    activeSaleId = null;
    completedSaleId = null;
    await cloud.client?.auth.signOut({ scope: "local" });
    user = null;
    vault.remove("identity");
    clearLicense("Signed out");
    return appState();
  }
  if (command.action === "auth.password") {
    if (!user || !cloud.client) throw new Error("Sign in first");
    const { error } = await cloud.client.auth.updateUser({
      password: command.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  if (command.action.startsWith("admin.")) {
    if (kind !== "developer")
      throw new Error("Developer commands are unavailable in the POS");
    if (command.action !== "admin.list") updates.assertCanStartWork();
    const result = await cloud.call(command);
    online = true;
    return result;
  }
  if (command.action === "update.check") return updates.check();
  if (command.action === "update.download") return updates.download();
  if (command.action === "update.preferences")
    return updates.preferences(command.autoOptional);
  if (command.action === "update.defer") return updates.defer();
  if (command.action === "update.install")
    return updates.install(command.cartEmpty);
  if (kind !== "pos")
    throw new Error("POS command unavailable in developer console");
  if (command.action === "license.refresh") {
    await refreshLicense();
    return appState();
  }
  if (command.action === "pos.state") {
    const lic = await currentLicense();
    return db.state(
      lic.tenantId,
      lic.userId,
      can(lic.role, "reports") && lic.modules.includes("reports"),
    );
  }
  if (command.action === "pos.beginSale") {
    updates.assertCanStartWork();
    await authorize("checkout");
    updates.assertCanStartWork();
    activeSaleId ??= randomUUID();
    return { id: activeSaleId };
  }
  if (command.action === "pos.cancelSale") {
    if (activeSaleId === command.id) activeSaleId = null;
    return { ok: true };
  }
  if (command.action === "pos.product") {
    updates.assertCanStartWork();
    const lic = await authorize("inventory");
    db.saveProduct(lic.tenantId, command.product);
    return { ok: true };
  }
  if (command.action === "pos.checkout") {
    if (
      updates.state.required &&
      command.checkout.id !== activeSaleId &&
      command.checkout.id !== completedSaleId
    )
      updates.assertCanStartWork();
    const lic = await authorize("checkout");
    if (command.checkout.method === "gcash" && !lic.modules.includes("gcash"))
      throw new Error("GCash is not included in this subscription");
    const sale = db.checkout(command.checkout, lic, signedLease!, clock.now());
    completedSaleId = sale.id;
    if (activeSaleId === sale.id) activeSaleId = null;
    return sale;
  }
  if (command.action === "pos.sync") return syncSales();
  if (command.action === "pos.export") {
    const lic = await authorize("reports");
    const { filePath, canceled } = await dialog.showSaveDialog(window, {
      title: "Export sales",
      defaultPath: `OmniPOS-sales-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { saved: false };
    const rows = db.db
      .prepare("SELECT data FROM sales WHERE tenant_id=? ORDER BY created_at")
      .all(lic.tenantId) as { data: string }[];
    writeFileSync(
      filePath,
      JSON.stringify(
        rows.map((r) => JSON.parse(r.data)),
        null,
        2,
      ),
    );
    return { saved: true };
  }
  throw new Error("Unsupported command");
}

if (gotLock)
  app
    .whenReady()
    .then(async () => {
      mkdirSync(app.getPath("userData"), { recursive: true });
      db = new LocalDatabase(join(app.getPath("userData"), "omnipos.sqlite"));
      vault = new Vault(db);
      cloud = new Cloud(__APP_CONFIG__, vault);
      updates = new Updates(
        kind,
        __APP_CONFIG__,
        db,
        () => activeSaleId === null,
      );
      clock = new LicenseClock(Number(db.get("clock") ?? 0));
      deviceId = db.get("device") ?? randomUUID();
      db.set("device", deviceId);
      try {
        user = JSON.parse(vault.get("identity") ?? "null");
        signedLease = vault.get("lease");
      } catch {
        user = null;
      }
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      const rendererRoot = resolve(__dirname, "renderer");
      protocol.handle("omni", (request) => {
        const url = new URL(request.url);
        if (url.host !== "app")
          return new Response("Forbidden", { status: 403 });
        const relative =
          decodeURIComponent(url.pathname) === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname).slice(1);
        const file = resolve(rendererRoot, relative);
        if (
          !file.startsWith(rendererRoot + sep) ||
          ![".html", ".js", ".css", ".svg", ".png", ".woff2"].includes(
            extname(file),
          )
        )
          return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      });
      const devUrl = !app.isPackaged ? process.env.OMNIPOS_DEV_URL : undefined;
      window = new BrowserWindow({
        width: 1440,
        height: 930,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: "#f6f7fb",
        show: false,
        autoHideMenuBar: true,
        title: app.getName(),
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: !app.isPackaged,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      ipcMain.handle("omni:command", async (event, raw) => {
        const senderUrl = event.senderFrame?.url ?? "";
        const expected = devUrl ? new URL(devUrl).origin : "omni://app";
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          !(senderUrl === expected || senderUrl.startsWith(expected + "/"))
        )
          return { ok: false, error: "Untrusted IPC sender" };
        try {
          return { ok: true, data: await handle(Command.parse(raw)) };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Operation failed",
          };
        }
      });
      window.once("ready-to-show", () => window.show());
      await window.loadURL(devUrl ?? "omni://app/index.html");
      updates.start();
      if (user && kind === "pos") void refreshLicense();
      const timer = setInterval(() => {
        try {
          clock.now();
          db.set("clock", String(clock.watermark()));
        } catch {
          lease = null;
          blockedReason =
            "Clock moved backwards. Correct the clock and reconnect.";
        }
      }, 30_000);
      timer.unref();
      const refreshTimer = setInterval(async () => {
        if (kind === "pos" && user) {
          await refreshLicense();
          if (lease) await syncSales().catch(() => {});
        }
      }, 5 * 60_000);
      refreshTimer.unref();
      app.on("second-instance", () => {
        window.restore();
        window.focus();
      });
    })
    .catch(() => {
      dialog.showErrorBox(
        "OmniPOS startup failed",
        "Could not initialize local storage. Contact your developer.",
      );
      app.quit();
    });
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  updates?.stop();
  db?.close();
});
