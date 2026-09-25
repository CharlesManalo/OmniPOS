# OmniPOS

Two separate Windows applications for Charles Manalo’s licensed, multi-tenant POS platform.

| Application       | Purpose                                                                                           | Installer                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| OmniPOS           | Client checkout, catalog, local stock, sales history, cloud sale backup                           | `release/pos/OmniPOS-Setup-0.1.1.exe`                 |
| OmniPOS Developer | Client accounts, tenant lifecycle, subscription renewal, roles, modules, terminals, audit history | `release/developer/OmniPOS-Developer-Setup-0.1.1.exe` |

This is the initial implementation. The Supabase backend and public build settings have been configured for project `yhovrmjbtwwnzmsrdnja`. See [deployment status](docs/DEPLOYMENT.md) for verification and remaining release requirements, and [the setup guide](docs/SETUP.md) for reproduction. Applications fail closed when cloud configuration or client licensing is missing.

## Start locally

To use the built installers and create your first client, follow [the quick start](docs/QUICKSTART.md).

Use Windows 10/11 x64 and Node.js 22.12 or later.

```powershell
npm ci
npm run dev:developer
# In a second terminal:
npm run dev:pos
```

To inspect the interface with clearly labeled sample data, use `npm run dev:developer -- --browser` (port 5174) and `npm run dev:pos -- --browser` (port 5173). Preview data stays in memory and is never included in packaged applications.

```powershell
npm run check
npm run test:desktop
npm run test:integration
npm run package
npm run release:prepare -- optional
npm run verify:packages
npm run test:packaged
```

The SQLite 13 package ships Node-API binaries. `postinstall` verifies the native module inside Electron; rebuilding it with node-gyp is unnecessary. Installers keep each app’s data in its own `%APPDATA%` directory and preserve it during uninstall/reinstallation.

## Organization

```text
apps/
  developer/src/        Developer console views
  pos/src/              Client POS views and cart state
packages/
  domain/               Contracts, permissions, money, signed-license verification
  desktop/              Electron main/preload, SQLite, encrypted sessions, cloud, updater
  ui/                   Shared UI, bundled fonts, styles, development-only preview
supabase/
  migrations/           PostgreSQL schema, grants, RLS, atomic administration RPCs
  functions/            Authenticated control-plane Edge Function
scripts/                Build, package, signing-key generation and desktop checks
tests/                  Domain, native SQLite, cloud failures and PostgreSQL policy tests
.github/workflows/      CI and draft GitHub release creation
docs/                   Setup, architecture, release and operating instructions
```

## Included

- Create tenants and initial login accounts; create further users and assign owner, manager, cashier, or auditor roles.
- Configure retail/grocery/cafe/restaurant business labels, starter/professional/enterprise/custom plans, enabled POS/inventory/reports/GCash modules, terminal limits, and expiry dates.
- Renew, disable, re-enable, recoverably delete and restore tenants. Disable/re-enable users and revoke terminals.
- Server-only developer allowlist, deny-by-default database grants, RLS, atomic administration and an audit log.
- Device/account-bound signed licenses: up to 24 hours offline, never past paid expiry; five-minute background checks and per-operation validation.
- Local product catalog, barcode search, stock, cash payments, manually verified GCash recording, receipts and exports. Integer-centavo arithmetic, transactional stock/payment/outbox writes, and idempotent checkout.
- GitHub release update checks, developer-selected required/optional policies, client opt-in automatic optional updates, sale-safe restart and offline patch notes. Separate feeds keep the two applications distinct.

## Deliberate boundaries

Stock is managed per terminal in this release. The cloud outbox backs up sales; it is **not** a full multi-terminal inventory synchronization engine. Product catalogs are local. Business-type labels do not yet enable specialized restaurant/kitchen or grocery integrations. There is no tax engine, statutory invoice certification, hardware thermal printing, refunds, or payment-processor integration yet. Receipts are internal transaction records. Sales backup upload requires an active current lease in the desktop UI; queued data survives expiry and can be uploaded after renewal.

Offline machines cannot receive an immediate remote revocation. They stop at their signed lease deadline or at the next successful check, whichever comes first. A hostile local administrator can modify any locally installed software; licensing here provides server authorization, signed entitlements, and ordinary clock rollback detection, not an absolute DRM guarantee.

See [architecture](docs/IMPLEMENTATION.md), [operations](docs/OPERATIONS.md), and [GitHub releases](docs/RELEASING.md).
