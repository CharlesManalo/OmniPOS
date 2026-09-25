// Operator-only release utility. Never included in either desktop application.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { github, repository } from "./github-api.mjs";
import { load } from "js-yaml";
import { ReleaseMetadata } from "../packages/domain/update-policy.ts";

if (!process.argv.includes("--publish"))
  throw new Error(
    "Use --publish after reviewing and pushing the exact source commit/tag",
  );
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const tag = `v${version}`;
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const ref = await github(`/repos/${repository}/git/ref/tags/${tag}`);
if (ref.object.sha !== commit)
  throw new Error(
    "Remote release tag does not match the reviewed local commit",
  );
const config = parse(await readFile(".env"));
for (const name of [
  "OMNIPOS_SUPABASE_URL",
  "OMNIPOS_SUPABASE_PUBLISHABLE_KEY",
  "OMNIPOS_LICENSE_PUBLIC_KEY",
  "OMNIPOS_PUBLISHER_NAME",
]) {
  const value = config[name] ?? "";
  if (/sbp_|sb_secret_|PRIVATE KEY/.test(value))
    throw new Error("Secret in public repository configuration");
  const base = `/repos/${repository}/actions/variables`;
  try {
    await github(`${base}/${name}`, { method: "PATCH", body: { name, value } });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github(base, { method: "POST", body: { name, value } });
  }
}
const files = [];
for (const kind of ["pos", "developer"]) {
  const manifest = load(await readFile(`release/${kind}/${kind}.yml`, "utf8"));
  ReleaseMetadata.parse(manifest);
  if (manifest.version !== version) throw new Error("Stale manifest");
  const slug = kind === "pos" ? "OmniPOS" : "OmniPOS-Developer";
  for (const name of [
    `${slug}-Setup-${version}.exe`,
    `${slug}-Setup-${version}.exe.blockmap`,
    `${kind}.yml`,
  ]) {
    const data = await readFile(`release/${kind}/${name}`);
    if (
      name.endsWith(".exe") &&
      createHash("sha512").update(data).digest("base64") !== manifest.sha512
    )
      throw new Error("Installer checksum mismatch");
    files.push({
      name,
      data,
      digest: `sha256:${createHash("sha256").update(data).digest("hex")}`,
    });
  }
}
let release;
try {
  release = await github(`/repos/${repository}/releases/tags/${tag}`);
} catch (error) {
  if (error.status !== 404) throw error;
}
if (release && !release.draft)
  throw new Error(
    "This version is already published; do not overwrite a public release",
  );
if (!release)
  release = await github(`/repos/${repository}/releases`, {
    method: "POST",
    body: {
      tag_name: tag,
      target_commitish: commit,
      name: `OmniPOS ${tag}`,
      body: await readFile("release/notes.md", "utf8"),
      draft: true,
      prerelease: false,
    },
  });
for (const file of files) {
  const assets = await github(
    `/repos/${repository}/releases/${release.id}/assets`,
  );
  const existing = assets.find((asset) => asset.name === file.name);
  if (existing) {
    if (existing.digest !== file.digest || existing.size !== file.data.length)
      throw new Error(
        `Existing asset differs: ${file.name}. Review before replacing it.`,
      );
    console.log(`Verified existing asset: ${file.name}`);
    continue;
  }
  const url = `${release.upload_url.split("{")[0]}?name=${encodeURIComponent(file.name)}`;
  const uploaded = await github(url, {
    method: "POST",
    raw: file.data,
    contentType: "application/octet-stream",
  });
  if (uploaded.size !== file.data.length || uploaded.digest !== file.digest)
    throw new Error(`Upload verification failed: ${file.name}`);
  console.log(`Uploaded and verified ${file.name}`);
}
const published = await github(`/repos/${repository}/releases/${release.id}`, {
  method: "PATCH",
  body: { draft: false, make_latest: "true" },
});
const latest = await github(`/repos/${repository}/releases/latest`);
if (latest.id !== published.id || latest.assets.length !== files.length)
  throw new Error("Published-release verification failed");
console.log(`Published ${published.html_url}`);
