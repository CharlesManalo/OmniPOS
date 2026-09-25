import type { Command } from "../domain/contracts";
declare global {
  const __APP_KIND__: "pos" | "developer";
  const __APP_CONFIG__: {
    supabaseUrl: string;
    publishableKey: string;
    licensePublicKey: string;
    githubOwner: string;
    githubRepo: string;
    publisher: string;
  };
  interface Window {
    omni: { invoke<T = unknown>(command: Command): Promise<T> };
  }
}
export {};
