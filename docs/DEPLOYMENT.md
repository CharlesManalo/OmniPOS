# Deployment status — 2026-09-25

## Live Supabase backend

Project `yhovrmjbtwwnzmsrdnja` (OmniPOS) was confirmed healthy through the authenticated CLI. Its public schema and Edge Function list were empty before deployment. No pre-existing application data was overwritten.

- Migration `20260924134911_omnipos_control_plane.sql` applied and recorded in remote migration history.
- All six `omni_*` tables have RLS enabled. Privileged RPCs are unavailable to anonymous/client roles.
- `control-plane` deployed; it verifies the authenticated user and live developer allowlist.
- License signing keys generated locally and installed in Edge Function secrets. Only public verification settings are included in desktop builds.
- Hosted public signup disabled; clients are created through Developer.
- Initial developer login created for the corrected email supplied by the owner. Initial credentials are in `.secrets/developer-login.json`, ignored by Git and protected by a Windows ACL. Open locally; do not upload or share this file. Change the initial password in Developer and keep the new password in a password manager.
- `.env` contains the configured public desktop settings. Keep the signing identity backed up securely; ordinary updates must not regenerate it.

## Verification performed

- TypeScript checking, 41 automated domain/SQLite/PostgreSQL tests, and both application builds passed.
- Real Electron desktop startup and mock-server integration cover encrypted session restart offline, transactional checkout, expiry, role restrictions and server denial.
- Live hosted tests passed: developer login, anonymous rejection, disabled public signup, tenant isolation, client self-promotion prevention, signed license binding, 24-hour cap, paid-expiry cap, terminal limits, disable/re-enable, renewal, recoverable deletion/restore and terminal revocation.
- A real Electron POS signed into a temporary hosted client, saved a GCash sale with reference `0042`, retried checkout without duplicate stock deduction, backed the sale up to Supabase, and enforced live user disable/role changes.
- Both 0.1.0 Windows installers were built (about 119 MiB each). SHA-512 hashes match their update manifests, packaged code matches the current build, and neither package includes private files, test fixtures, or the other application's renderer.
- Both packaged EXEs launched successfully with sandboxed, isolated renderers, working native SQLite and validated IPC. Separate application data directories and update channels were verified. The Developer packaged EXE signed in through its real UI and loaded the live portfolio, then signed out.
- Disposable hosted test accounts, tenants, audit rows and sale records were removed using their exact generated IDs. The real developer account was preserved.
- The live Supabase security advisor reported no database/RLS warnings. One Auth warning remains: leaked-password protection is disabled. Supabase makes this available on Pro and above; no paid-plan change was made. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

The opt-in `npm run test:hosted` command creates and removes disposable live fixtures. It is deliberately **not** part of ordinary CI. It uses the private initial developer credential file; after changing your password, do not run it without deliberately providing current local test credentials.

## Before distributing to paying clients

1. Change the initial developer password and remove the initial credential file after testing. Preserve the license signing key backup.
2. Configure a Windows code-signing certificate. Initial local installers are unsigned and may trigger Windows warnings.
3. Use `CharlesManalo/OmniPOS` for source and distribution. Keep the public GitHub Actions variables synchronized with the public desktop build configuration. Select optional/required and draft/immediate publication in the manual release workflow; see [RELEASING.md](RELEASING.md).
4. Test installer upgrades, offline operation and hardware on the actual client PCs. Hardware printing, certified invoicing, refunds and multi-terminal inventory sync are not included in this initial build; see the README boundaries.

The 0.1.1 update adds required/optional release policies, automatic optional-update consent, main-process sale-safe restart, and offline patch notes. 54 automated tests pass, including mandatory-policy caching and automatic-restart timing. Real Electron integration verifies that a mandatory update lets only the already-open sale finish and keeps the restriction across restart. Preview UI checks cover client management, GCash checkout and patch-note display at 1024px.

The manual GitHub workflow builds separate POS and Developer installers and update feeds. Test the final installer replacement on a disposable Windows installation before broad deployment; downloading an update is not the same as proving the complete OS-level installer/relaunch cycle.
