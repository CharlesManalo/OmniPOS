import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { safeStorage } from "electron";
import { LocalDatabase } from "./database";

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export class Vault {
  constructor(private db: LocalDatabase) {}
  get(key: string) {
    const value = this.db.get(`vault:${key}`);
    if (!value) return null;
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows credential encryption unavailable");
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      this.db.remove(`vault:${key}`);
      return null;
    }
  }
  set(key: string, value: string) {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("Windows credential encryption unavailable");
    this.db.set(
      `vault:${key}`,
      safeStorage.encryptString(value).toString("base64"),
    );
  }
  remove(key: string) {
    this.db.remove(`vault:${key}`);
  }
}
export class Cloud {
  client: SupabaseClient | null;
  constructor(config: typeof __APP_CONFIG__, vault: Vault) {
    this.client =
      config.supabaseUrl && config.publishableKey
        ? createClient(config.supabaseUrl, config.publishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false,
              storage: {
                getItem: (key) => vault.get(`session:${key}`),
                setItem: (key, value) => vault.set(`session:${key}`, value),
                removeItem: (key) => vault.remove(`session:${key}`),
              },
            },
            global: {
              fetch: (url, init) =>
                fetch(url, {
                  ...init,
                  signal: init?.signal ?? AbortSignal.timeout(12000),
                }),
            },
          })
        : null;
  }
  async call<T>(body: unknown): Promise<T> {
    if (!this.client)
      throw new Error("Configure the Supabase public build settings first");
    const {
      data: { session },
      error: sessionError,
    } = await this.client.auth.getSession();
    if (sessionError) {
      // A failed refresh while offline must not revoke an otherwise valid signed lease.
      if (
        sessionError.name === "AuthRetryableFetchError" ||
        !sessionError.status ||
        sessionError.status >= 500
      )
        throw new CloudError(
          "Unable to refresh the cloud session while offline",
          0,
        );
      throw new CloudError("Session invalid. Sign in again.", 401);
    }
    if (!session) throw new CloudError("Sign in to continue", 401);
    let response: Response;
    try {
      response = await fetch(
        `${__APP_CONFIG__.supabaseUrl}/functions/v1/control-plane`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: __APP_CONFIG__.publishableKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        },
      );
    } catch {
      throw new CloudError("Unable to reach the license server", 0);
    }
    const result = await response
      .json()
      .catch(() => ({ error: "Unexpected server response" }));
    if (!response.ok)
      throw new CloudError(
        result.error ?? "Server request failed",
        response.status,
      );
    return result as T;
  }
}
