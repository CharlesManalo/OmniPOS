import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../domain/contracts";
import { compareVersions, updateDecision } from "../domain/update-policy";

type Store = {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
};
export class Updates {
  state: UpdateState = {
    status: "idle",
    message: "Updates delivered through GitHub Releases.",
    autoOptional: false,
    required: false,
  };
  private checking: Promise<UpdateState> | null = null;
  private downloading: Promise<UpdateState> | null = null;
  private restartRequested = false;
  private restartTimer?: ReturnType<typeof setInterval>;
  private checkTimer?: ReturnType<typeof setInterval>;
  private installing = false;
  constructor(
    private kind: string,
    config: typeof __APP_CONFIG__,
    private store: Store,
    private safeToRestart: () => boolean,
  ) {
    this.state.autoOptional = store.get("updates:autoOptional") === "true";
    try {
      const cached = JSON.parse(store.get("updates:release") ?? "null");
      if (cached && compareVersions(app.getVersion(), cached.version) < 0)
        this.applyMetadata(cached);
    } catch {
      /* Invalid local cache cannot grant permissions or select a download URL. */
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.setFeedURL({
      provider: "generic",
      url: `https://github.com/${config.githubOwner}/${config.githubRepo}/releases/latest/download/`,
      channel: kind,
    });
    autoUpdater.on("checking-for-update", () => {
      this.state = {
        ...this.state,
        status: "checking",
        message: "Checking GitHub…",
      };
    });
    autoUpdater.on("update-available", (info) => {
      try {
        this.applyMetadata(info);
        if (
          this.kind === "pos" &&
          (this.state.required || this.state.autoOptional)
        ) {
          queueMicrotask(() => {
            void this.download().catch(() => {});
          });
        }
      } catch {
        this.fail("Release metadata is invalid. Contact your developer.");
      }
    });
    autoUpdater.on("update-not-available", (info) => {
      try {
        this.applyMetadata(info);
        this.state = {
          ...this.state,
          status: "current",
          message: "You’re running the latest version.",
          required: false,
          restartAt: undefined,
        };
      } catch {
        this.fail("Release metadata is invalid. Contact your developer.");
      }
    });
    autoUpdater.on("download-progress", (p) => {
      this.state = {
        ...this.state,
        status: "downloading",
        message: "Downloading update…",
        progress: Math.round(p.percent),
      };
    });
    autoUpdater.on("update-downloaded", (info) => {
      if (info.version !== this.state.version)
        return this.fail("Downloaded update version mismatch.");
      this.state = {
        ...this.state,
        status: "ready",
        progress: 100,
        message: "Update downloaded. Preparing a safe restart.",
      };
      this.tickRestart();
    });
    autoUpdater.on("error", () =>
      this.fail(
        "Update unavailable. Check your internet connection and published release.",
      ),
    );
  }
  private applyMetadata(raw: unknown) {
    const decision = updateDecision(app.getVersion(), raw);
    this.store.set("updates:release", JSON.stringify(decision));
    this.state = {
      ...this.state,
      status: "available",
      version: decision.version,
      required: decision.required,
      minimumVersion: decision.omniposPolicy.minimumVersion,
      releaseNotes: decision.releaseNotes,
      progress: undefined,
      restartAt: undefined,
      message: decision.required
        ? "Required update. Finish or clear the current sale; new sales are blocked."
        : "An optional update is available. You can update now or later.",
    };
  }
  private fail(message: string) {
    // Network failure must never erase a previously verified required-update floor.
    this.state = {
      ...this.state,
      status: "error",
      message,
      restartAt: undefined,
    };
  }
  start() {
    if (!app.isPackaged) return;
    void this.check();
    this.checkTimer = setInterval(() => {
      void this.check();
    }, 15 * 60_000);
    this.checkTimer.unref();
    this.restartTimer = setInterval(() => this.tickRestart(), 1000);
    this.restartTimer.unref();
  }
  stop() {
    clearInterval(this.checkTimer);
    clearInterval(this.restartTimer);
  }
  assertCanStartWork() {
    if (this.state.required || this.installing)
      throw new Error(
        "A required software update must be installed before starting new work.",
      );
  }
  async check(): Promise<UpdateState> {
    if (!app.isPackaged)
      return (this.state = {
        ...this.state,
        status: "unconfigured",
        message: "Update checks are available in installed builds.",
      });
    if (this.downloading || this.state.status === "ready") return this.state;
    if (this.checking) return this.checking;
    this.checking = (async () => {
      try {
        await autoUpdater.checkForUpdates();
      } catch {
        this.fail(
          "Update check failed. Your last known update policy is retained.",
        );
      }
      return this.state;
    })().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }
  async download(): Promise<UpdateState> {
    if (this.downloading) return this.downloading;
    if (this.state.status !== "available")
      throw new Error("Check for an update first");
    this.restartRequested = true;
    this.state = {
      ...this.state,
      status: "downloading",
      progress: 0,
      message: "Downloading update…",
    };
    this.downloading = (async () => {
      try {
        await autoUpdater.downloadUpdate();
      } catch {
        this.fail("Download failed. Check your connection and try again.");
      }
      return this.state;
    })().finally(() => {
      this.downloading = null;
    });
    return this.downloading;
  }
  preferences(autoOptional: boolean) {
    this.store.set("updates:autoOptional", String(autoOptional));
    this.state = { ...this.state, autoOptional };
    if (
      autoOptional &&
      this.kind === "pos" &&
      this.state.status === "available"
    )
      void this.download();
    return this.state;
  }
  defer() {
    if (this.state.required)
      throw new Error("This update is required by your developer");
    this.restartRequested = false;
    this.state = {
      ...this.state,
      restartAt: undefined,
      message: "Update postponed. You can install it from Updates later.",
    };
    return this.state;
  }
  private tickRestart() {
    if (
      this.kind !== "pos" ||
      this.state.status !== "ready" ||
      !this.restartRequested ||
      this.installing
    )
      return;
    if (!this.safeToRestart()) {
      this.state = {
        ...this.state,
        restartAt: undefined,
        message:
          "Update ready. Finish or clear your current sale to restart safely.",
      };
      return;
    }
    if (!this.state.restartAt) {
      this.state = {
        ...this.state,
        restartAt: Date.now() + 15_000,
        message:
          "Update ready. The application will close and reopen in 15 seconds.",
      };
    } else if (Date.now() >= this.state.restartAt) this.install(true);
  }
  install(cartEmpty: boolean) {
    if (!cartEmpty || !this.safeToRestart())
      throw new Error("Complete or clear the sale before installing");
    if (this.state.status !== "ready")
      throw new Error("Download an update first");
    if (this.installing) return;
    this.installing = true;
    this.stop();
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }
}
