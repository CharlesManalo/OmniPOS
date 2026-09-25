import { extractFile, listPackage } from "@electron/asar";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalize } from "node:path";
import { load as parse } from "js-yaml";
import { ReleaseMetadata } from "../packages/domain/update-policy.ts";
const digest = (data) => createHash("sha512").update(data).digest("base64");
for (const kind of ["pos", "developer"]) {
  const dir = `release/${kind}`;
  const manifest = parse(await readFile(`${dir}/${kind}.yml`, "utf8"));
  ReleaseMetadata.parse(manifest);
  const installer = await readFile(`${dir}/${manifest.path}`);
  if (digest(installer) !== manifest.sha512)
    throw new Error(`Installer hash mismatch: ${kind}`);
  if (!installer.subarray(0, 2).equals(Buffer.from("MZ")))
    throw new Error("Not a Windows executable");
  const archive = `${dir}/win-unpacked/resources/app.asar`;
  const files = listPackage(archive);
  if (
    files.some((p) =>
      /(^|[\\/])(\.env|\.secrets|tests|test-results)([\\/.]|$)/.test(p),
    )
  )
    throw new Error("Sensitive or test artifacts in package");
  const metadata = JSON.parse(extractFile(archive, "package.json").toString());
  if (metadata.main !== `dist/${kind}/main.cjs`)
    throw new Error("Wrong main entry");
  const packaged = extractFile(archive, normalize(metadata.main)),
    built = await readFile(`dist/${kind}/main.cjs`);
  if (digest(packaged) !== digest(built))
    throw new Error("Packaged code differs from current build");
  const updater = parse(
    await readFile(`${dir}/win-unpacked/resources/app-update.yml`, "utf8"),
  );
  if (updater.channel !== kind) throw new Error("Wrong update channel");
  const wrongApp = kind === "pos" ? "developer" : "pos";
  if (
    files.some((p) => p.replaceAll("\\", "/").startsWith(`/dist/${wrongApp}/`))
  )
    throw new Error("The other application was bundled");
  console.log(
    `${kind}: installer ${Math.round(installer.length / 1024 / 1024)} MB; SHA-512, packaged main, app separation and ${kind}.yml feed verified.`,
  );
}
