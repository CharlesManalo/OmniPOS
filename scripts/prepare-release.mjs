import { readFile, writeFile, mkdir } from "node:fs/promises";
import { load, dump } from "js-yaml";
import {
  ReleaseMetadata,
  StableVersion,
  compareVersions,
} from "../packages/domain/update-policy.ts";

const mode = process.argv[2] ?? process.env.UPDATE_REQUIREMENT ?? "optional";
if (!["optional", "required"].includes(mode))
  throw new Error("Choose optional or required");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
StableVersion.parse(version);
const notes = JSON.parse(await readFile("release-notes.json", "utf8"));
if (notes.version !== version)
  throw new Error("Patch notes must match package.json version");
const markdown =
  `# ${notes.title}\n\n` +
  notes.sections
    .map(
      (section) =>
        `## ${section.title}\n\n${section.items.map((item) => `- ${item}`).join("\n")}`,
    )
    .join("\n\n");
const repository = "CharlesManalo/OmniPOS";
const response = await fetch(
  `https://api.github.com/repos/${repository}/releases/latest`,
  {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(20_000),
  },
);
if (!response.ok && response.status !== 404)
  throw new Error(`Cannot determine previous release: HTTP ${response.status}`);
const previous = response.status === 404 ? null : await response.json();
for (const kind of ["pos", "developer"]) {
  let floor = "0.0.0";
  if (previous) {
    const asset = previous.assets.find((asset) => asset.name === `${kind}.yml`);
    if (!asset)
      throw new Error(
        `Previous release has no ${kind}.yml; refusing to discard its update policy`,
      );
    const prior = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!prior.ok)
      throw new Error(`Cannot read previous ${kind} update policy`);
    const meta = ReleaseMetadata.parse(load(await prior.text()));
    if (compareVersions(version, meta.version) <= 0)
      throw new Error("New release version must exceed the published version");
    floor = meta.omniposPolicy.minimumVersion;
  }
  const file = `release/${kind}/${kind}.yml`;
  const manifest = load(await readFile(file, "utf8"));
  if (manifest.version !== version)
    throw new Error(`Stale ${kind} installer: rebuild before releasing`);
  manifest.omniposPolicy = {
    schemaVersion: 1,
    mode,
    minimumVersion: mode === "required" ? version : floor,
  };
  manifest.releaseNotes = markdown;
  ReleaseMetadata.parse(manifest);
  await writeFile(file, dump(manifest, { lineWidth: 120 }));
  console.log(
    `${kind}: ${version}, ${mode}, minimum supported ${manifest.omniposPolicy.minimumVersion}`,
  );
}
await mkdir("release", { recursive: true });
await writeFile(
  "release/notes.md",
  `Update choice: **${mode}**.\n\n${markdown}\n\nWindows installers are currently unsigned unless a signing certificate was configured for this build.\n`,
);
