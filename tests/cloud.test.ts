import { it, expect, vi, afterEach } from "vitest";
vi.mock("electron", () => ({ safeStorage: {} }));
import { Cloud, CloudError } from "../packages/desktop/cloud";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vault } from "../packages/desktop/cloud";
afterEach(() => vi.unstubAllGlobals());
it("preserves offline eligibility when Supabase refresh fails due to network loss", async () => {
  const cloud = new Cloud(
    {
      supabaseUrl: "",
      publishableKey: "",
      licensePublicKey: "",
      githubOwner: "",
      githubRepo: "",
      publisher: "",
    },
    {} as Vault,
  );
  cloud.client = {
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthRetryableFetchError", status: 0 },
      }),
    },
  } as unknown as SupabaseClient;
  await expect(cloud.call({ action: "license.issue" })).rejects.toMatchObject({
    status: 0,
  });
});
it("distinguishes invalid/revoked refresh credentials from network failure", async () => {
  const cloud = new Cloud(
    {
      supabaseUrl: "",
      publishableKey: "",
      licensePublicKey: "",
      githubOwner: "",
      githubRepo: "",
      publisher: "",
    },
    {} as Vault,
  );
  cloud.client = {
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: { name: "AuthApiError", status: 400 },
      }),
    },
  } as unknown as SupabaseClient;
  await expect(cloud.call({ action: "license.issue" })).rejects.toMatchObject({
    status: 401,
  });
});
