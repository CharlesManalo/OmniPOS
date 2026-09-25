import type { AppState, Command } from "../domain/contracts";
import releaseNotes from "../../release-notes.json";
export async function initializeBridge(kind: "pos" | "developer") {
  if (!window.omni && import.meta.env.DEV) {
    const { makePreview } = await import("./preview");
    window.omni = makePreview(kind);
  }
}
export async function invoke<T = unknown>(command: Command): Promise<T> {
  if (!window.omni)
    throw new Error("Open this application from its Windows executable.");
  return window.omni.invoke<T>(command);
}
export const initialState: AppState = {
  kind: "pos",
  version: releaseNotes.version,
  configured: false,
  missing: [],
  user: null,
  license: null,
  blockedReason: null,
  online: false,
  deviceId: "",
  update: { status: "idle", message: "Check for software updates." },
  preview: false,
};
