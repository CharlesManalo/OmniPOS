import { build as bundle } from "esbuild";
import { build as viteBuild } from "vite";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
config({ quiet: true });
export const appConfig = {
  supabaseUrl:
    process.env.OMNIPOS_SUPABASE_URL ??
    "https://yhovrmjbtwwnzmsrdnja.supabase.co",
  publishableKey: process.env.OMNIPOS_SUPABASE_PUBLISHABLE_KEY ?? "",
  licensePublicKey: process.env.OMNIPOS_LICENSE_PUBLIC_KEY ?? "",
  githubOwner: process.env.OMNIPOS_GITHUB_OWNER ?? "CharlesManalo",
  githubRepo: process.env.OMNIPOS_GITHUB_REPO ?? "OmniPOS",
  publisher: process.env.OMNIPOS_PUBLISHER_NAME ?? "",
};
if (
  appConfig.publishableKey.startsWith("sb_secret_") ||
  appConfig.publishableKey.startsWith("sbp_")
)
  throw new Error(
    "A secret was placed in public build settings. Use a publishable key.",
  );
if (appConfig.publishableKey.startsWith("ey")) {
  const payload = JSON.parse(
    Buffer.from(appConfig.publishableKey.split(".")[1], "base64url").toString(),
  );
  if (payload.role !== "anon")
    throw new Error("Only an anon/publishable key may be bundled.");
}
export async function buildMain(kind) {
  if (!["developer", "pos"].includes(kind))
    throw new Error("Unknown application");
  const common = {
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    logLevel: "warning",
    sourcemap: false,
    define: {
      __APP_KIND__: JSON.stringify(kind),
      __APP_CONFIG__: JSON.stringify(appConfig),
    },
  };
  await bundle({
    ...common,
    entryPoints: ["packages/desktop/main.ts"],
    outfile: `dist/${kind}/main.cjs`,
    external: ["electron", "better-sqlite3", "electron-updater"],
  });
  await bundle({
    ...common,
    entryPoints: ["packages/desktop/preload.ts"],
    outfile: `dist/${kind}/preload.cjs`,
    external: ["electron"],
  });
}
export async function buildApp(kind) {
  await buildMain(kind);
  await viteBuild({ mode: kind });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const kind of ["pos", "developer"]) await buildApp(kind);
  console.log("Built OmniPOS and OmniPOS Developer.");
}
