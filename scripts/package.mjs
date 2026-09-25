import { build, Platform, Arch } from "electron-builder";
import { appConfig } from "./build.mjs";
const kind = process.argv[2];
if (!["developer", "pos"].includes(kind))
  throw new Error("Choose pos or developer");
const productName = kind === "pos" ? "OmniPOS" : "OmniPOS Developer";
const slug = kind === "pos" ? "OmniPOS" : "OmniPOS-Developer";
await build({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  publish: "never",
  config: {
    appId:
      kind === "pos"
        ? "com.charlesmanalo.omnipos"
        : "com.charlesmanalo.omnipos.developer",
    productName,
    artifactName: `${slug}-Setup-\${version}.\${ext}`,
    directories: { output: `release/${kind}` },
    extraMetadata: {
      name: kind === "pos" ? "omnipos" : "omnipos-developer",
      main: `dist/${kind}/main.cjs`,
    },
    files: [
      `dist/${kind}/**/*`,
      "package.json",
      "!node_modules/**/{test,tests,__tests__,example,examples}{,/**/*}",
      "!node_modules/zod/src{,/**/*}",
    ],
    // better-sqlite3 13 ships ABI-stable Node-API binaries. Verified in Electron by postinstall.
    asar: true,
    asarUnpack: ["**/*.node"],
    npmRebuild: false,
    win: {
      target: "nsis",
      executableName: slug,
      ...(appConfig.publisher
        ? { signtoolOptions: { publisherName: appConfig.publisher } }
        : { signExecutable: false }),
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: productName,
      deleteAppDataOnUninstall: false,
    },
    publish: [
      {
        provider: "generic",
        url: `https://github.com/${appConfig.githubOwner}/${appConfig.githubRepo}/releases/latest/download/`,
        channel: kind,
      },
    ],
  },
});
