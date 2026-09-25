# OmniPOS implementation contract

Two independently installed Windows applications: **OmniPOS** (client POS) and **OmniPOS Developer** (private operator console). Shared TypeScript contracts, Electron services, and UI primitives live in `packages/`; application views live in `apps/`.

## Access and licensing

- Supabase Auth identifies people. A protected developer allowlist authorizes developer actions. Possessing the developer EXE alone confers no privilege.
- Every client belongs to exactly one tenant. Developer assigns owner, manager, cashier, or auditor roles. Tenants receive a business type, named plan, module entitlements, terminal limit, and paid expiry date.
- Server issues Ed25519-signed, device/user/tenant-bound licenses. Cached access lasts at most 24 hours and never beyond paid expiry. Recheck every five minutes when running. Explicit denial clears cached access. Network failure permits only the remaining signed lease.
- Main process checks entitlement on each operation. Renderer visibility is not authorization. A monotonic clock during a session and a persisted clock watermark detect ordinary clock rollback; local administrator tampering cannot be absolutely prevented by a desktop application.
- Disable and recoverable deletion prevent new leases. Offline revocation takes effect when the signed lease expires. Re-enable never silently renews an expired subscription.
- Account deletion is recoverable (tombstone) and preserves sales and audit history. Permanent financial-data destruction is deliberately outside this UI.

## Data and delivery

- SQLite WAL is the local transactional store. Money is integer centavos. Sale, payment, inventory deduction, and cloud outbox insertion commit together. Replayed checkout requests are idempotent.
- Supabase stores tenant configuration and sale backups. Cross-terminal stock reconciliation is not implied by sale backup: local stock is terminal-specific in this first build.
- Desktop clients contain only publishable configuration and license verification public key. Service-role and license signing keys stay in Supabase.
- GitHub repository: CharlesManalo/OmniPOS. Separate `pos` and `developer` update channel files and artifacts. Install downloaded updates only after user confirmation and when checkout is idle.
- First-run apps fail closed until cloud configuration is deployed. Sample data exists only in explicit development preview mode.

## Scope of the initial build

Tenant and user administration, module/plan assignment, renewals, license enforcement, local catalog/inventory, cash and recorded GCash checkout, receipt history, backup queue, Windows installers, and release automation. Hardware-specific thermal printing, statutory tax reporting, refunds, restaurant kitchen routing, and full multi-terminal inventory synchronization are follow-up features, not claimed by this release.
