import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "0.1.1" },
}));
vi.mock("electron-updater", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    autoUpdater: Object.assign(new EventEmitter(), {
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn(async () => null),
      downloadUpdate: vi.fn(async () => []),
      quitAndInstall: vi.fn(),
    }),
  };
});
import { autoUpdater } from "electron-updater";
import { Updates } from "../packages/desktop/updater";
const emitter = autoUpdater as unknown as EventEmitter;
let updater: Updates;
let values: Map<string, string>;
let safe = true;
const config = {
  supabaseUrl: "",
  publishableKey: "",
  licensePublicKey: "",
  githubOwner: "CharlesManalo",
  githubRepo: "OmniPOS",
  publisher: "",
};
const info = (required = false) => ({
  version: "0.1.2",
  releaseNotes: "Fixed checkout.",
  omniposPolicy: {
    schemaVersion: 1,
    mode: required ? "required" : "optional",
    minimumVersion: required ? "0.1.2" : "0.0.0",
  },
});
const store = {
  get: (key: string) => values.get(key),
  set: (key: string, value: string) => {
    values.set(key, value);
  },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  emitter.removeAllListeners();
  values = new Map();
  safe = true;
  updater = new Updates("pos", config, store, () => safe);
});
afterEach(() => {
  updater.stop();
  emitter.removeAllListeners();
  vi.useRealTimers();
});
it("does not download optional releases without client consent", async () => {
  emitter.emit("update-available", info());
  await Promise.resolve();
  expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  expect(updater.state.required).toBe(false);
});
it("persists optional auto-update consent and downloads when enabled", async () => {
  updater.preferences(true);
  emitter.emit("update-available", info());
  await vi.runAllTicks();
  expect(values.get("updates:autoOptional")).toBe("true");
  expect(autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
});
it("required release blocks new work, downloads, and cannot be postponed", async () => {
  emitter.emit("update-available", info(true));
  await vi.runAllTicks();
  expect(() => updater.assertCanStartWork()).toThrow();
  expect(autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
  expect(() => updater.defer()).toThrow();
});
it("retains mandatory policy after a network error and an offline restart", () => {
  emitter.emit("update-available", info(true));
  emitter.emit("error", new Error("offline"));
  expect(updater.state.required).toBe(true);
  updater.stop();
  emitter.removeAllListeners();
  updater = new Updates("pos", config, store, () => safe);
  expect(updater.state.required).toBe(true);
  expect(() => updater.assertCanStartWork()).toThrow();
});
it("waits for the sale, then gives 15 seconds before closing and reopening", async () => {
  updater.start();
  await Promise.resolve();
  emitter.emit("update-available", info());
  await updater.download();
  safe = false;
  emitter.emit("update-downloaded", info());
  await vi.advanceTimersByTimeAsync(30_000);
  expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  expect(updater.state.restartAt).toBeUndefined();
  safe = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(updater.state.restartAt).toBeDefined();
  await vi.advanceTimersByTimeAsync(14_000);
  expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001);
  expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
});
it("postpones a downloaded optional update", async () => {
  updater.start();
  await Promise.resolve();
  emitter.emit("update-available", info());
  await updater.download();
  emitter.emit("update-downloaded", info());
  updater.defer();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
});
it("manual install also enforces main-process sale safety", async () => {
  emitter.emit("update-available", info());
  await updater.download();
  emitter.emit("update-downloaded", info());
  safe = false;
  expect(() => updater.install(true)).toThrow(/sale/);
  expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
});
it("invalid metadata never permits a download", async () => {
  emitter.emit("update-available", { version: "0.1.2" });
  expect(updater.state.status).toBe("error");
  await expect(updater.download()).rejects.toThrow();
});
