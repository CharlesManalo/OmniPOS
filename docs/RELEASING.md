# Windows releases through GitHub

Repository: https://github.com/CharlesManalo/OmniPOS

Local work prepares the repository and workflow; it does not publish an update by itself. Clients will see updates only after a GitHub release is published with its installers, blockmaps, and both channel manifests.

## Repository configuration

Set these GitHub Actions repository **variables** from the public values used locally:

- `OMNIPOS_SUPABASE_URL`
- `OMNIPOS_SUPABASE_PUBLISHABLE_KEY`
- `OMNIPOS_LICENSE_PUBLIC_KEY`
- `OMNIPOS_PUBLISHER_NAME` when using a Windows signing certificate

Set the signing certificate as `WINDOWS_CERTIFICATE` and its password as `WINDOWS_CERTIFICATE_PASSWORD` in Actions **secrets**. Use a certificate/credential mechanism supported by electron-builder. The license private key and Supabase service-role key are not release-build inputs and must remain in Supabase.

The initial local installers may be unsigned when no certificate is configured. Windows can show an unknown-publisher warning. Configure code signing before distributing broadly. The updater uses HTTPS and SHA-512 artifact verification, with publisher verification when configured; a hash alone does not protect against a compromised release publisher.

## Release a patch

1. Commit and push source changes to the repository after reviewing them.
2. Run `npm version patch --no-git-tag-version`, update `release-notes.json` with the same version and accurate patch notes, then commit/push both with the code.
3. In GitHub, open **Actions → Build Windows release → Run workflow**. Select **optional** or **required**. Leave **Publish immediately** unchecked to review a draft first.
4. GitHub Actions tests and packages both apps, attaches the chosen policy and patch notes to both manifests, verifies installer hashes and application separation, smoke-tests the packaged executables, then creates a **draft release** and its version tag at the build's source commit.
5. Test both installers and an upgrade from the previous version on a disposable Windows machine.
6. Publish the draft (or select Publish immediately when starting the workflow if it is already approved). Only published stable releases are visible to clients.

The workflow runs manually so the developer chooses policy before publication; pushing a tag does not silently publish a release. An existing release version is never overwritten. No GitHub credential is embedded in desktop software. The repository is public, including both installers. Developer access is still enforced server-side. If the developer installer itself must be private, use a separate distribution mechanism without bundling a GitHub PAT.

## Artifacts

| App       | Files uploaded to each release                                        |
| --------- | --------------------------------------------------------------------- |
| POS       | `OmniPOS-Setup-X.Y.Z.exe`, its `.blockmap`, `pos.yml`                 |
| Developer | `OmniPOS-Developer-Setup-X.Y.Z.exe`, its `.blockmap`, `developer.yml` |

Both use the same public GitHub `releases/latest/download/` base with independent channels. Do not rename generated installer files or manifests after packaging. Always publish the two channel manifests with their corresponding installers. Never publish a release containing only one app’s manifest because the other client uses the latest-release download path too.

## Required and optional behavior

Each generated manifest contains `omniposPolicy` with `mode` and `minimumVersion`, plus text patch notes. A required release raises the minimum version to itself. A later optional release **retains the previous minimum**, so clients cannot bypass a missed required security patch by waiting for an optional release. Older-than-minimum clients treat the latest release as required.

The POS checks at launch and every 15 minutes, with a manual check in Updates. Optional updates never block work: clients can choose Update now or opt into automatic optional updates. Selected downloads install silently and reopen the app after a 15-second notice when no sale is open. Later postpones an optional downloaded update. Required releases download automatically, block new sales/product edits after detection, and let the already-open sale finish or be cleared before restart. Main-process sale tracking enforces this; the renderer's cart-empty flag alone cannot force a restart mid-sale. The Developer app keeps installation manual to avoid interrupting administrative edits.

Previously detected mandatory policy is retained through network failures and restarts. An offline client cannot discover a new release until it reconnects; its subscription lease still expires normally. Build 0.1.0 predates these controls and must be updated manually once to 0.1.1 or later. The bottom-left What's new button shows the installed version's bundled notes offline.

SQLite files are in application data and survive updates. Schema changes must be additive/versioned and compatible with offline clients; a new app release does not automatically apply cloud migrations. Do not publish mutable/replaced installers for an existing version. Test actual installer replacement on a disposable Windows installation, not a live cashier terminal.

For local release preparation, run `npm run package`, `npm run release:prepare -- optional` (or `required`), `npm run verify:packages`, and `npm run test:packaged`. The operator-only `scripts/publish-local.mjs --publish` uses Git Credential Manager in memory, verifies remote tag identity and every uploaded asset's digest, then publishes. It is not bundled in desktop apps. If a publish call times out, read the GitHub release before retrying; do not overwrite an already-published version.

Reference: [electron-builder auto-update](https://www.electron.build/docs/features/auto-update/).
