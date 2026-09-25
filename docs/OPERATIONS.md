# Developer operations

## Onboard a client

Select **New client**, enter business/contact details, choose a business type and plan, set a paid-until timestamp and terminal limit, and select modules. Set offline access to 24 hours or less. Create the initial account with the appropriate role and a password of at least 12 characters. Share credentials securely outside this application; the current implementation does not send invitation emails.

The initial account is immediately usable after successful provisioning. Clients can change their password under **Updates & account**. Inventory entitlement is needed to manage the local catalog. Starter and Professional presets include it; if you intentionally remove it, keep an already-populated catalog or restore the entitlement before adding products.

| Role    | Record sales | Manage products/stock | Report/export            |
| ------- | ------------ | --------------------- | ------------------------ |
| Owner   | Yes          | With inventory module | With reports module      |
| Manager | Yes          | With inventory module | With reports module      |
| Cashier | Yes          | No                    | Own recent receipts only |
| Auditor | No           | No                    | With reports module      |

All capabilities still require an active tenant license. GCash requires its own entitlement. Plan names are presets; the stored module selection is authoritative. Retail/cafe/grocery/restaurant are currently classifications, not different feature implementations.

## Renew, pause, and delete

- **Renew:** edit the client, extend “Paid access expires,” then save. Dates are entered in your local timezone and stored in UTC.
- **Disable/re-enable:** use the pause/play button. Re-enabling never extends the expiry date.
- **Delete:** use the trash button and type the exact business name. This is recoverable deletion: the tenant is locked and excluded from the normal list, while its accounts, transactions, and audit trail remain.
- **Restore:** choose the Deleted filter and click Enable. If the paid date is in the past, renew separately.
- **Disable a user:** open Client accounts and disable that user. Roles are editable there too.
- **Revoke a terminal:** open the client details and revoke the registered device. A revoked installation does not automatically re-register; use a fresh terminal installation identity or increase the limit for a replacement device.

Online terminals check every five minutes. Use Verify license to apply changes immediately on a connected terminal. An offline terminal continues only until its cached signed lease expires (at most 24 hours and never beyond paid expiry). Developer access requires a working cloud connection.

## Backups and money

Sale, payment, inventory deduction and outbox entry form one SQLite transaction. Retrying the same checkout ID does not duplicate a sale. Automatic sale backup runs during successful background checks; **Sales history → Back up sales** also runs it manually. Upload batches contain up to 50 sales; repeat for larger backlogs. GCash is manually verified by the cashier and recorded with the last four reference digits, preserving leading zeroes.

The outbox is a sale backup, not a full database backup. Back up local catalogs and SQLite files separately using a consistent SQLite backup tool; do not copy only the `.sqlite` file while WAL writes are in progress. Preserve the `.sqlite-wal` and `.sqlite-shm` files if recovering a stopped/crashed database.

Exports contain all terminal sales for the licensed tenant. The history view shows the latest 200 records (50 own records for cashiers). Customer records, card data, and payment-provider credentials are not collected by this version.

## Before commercial use

Run the hosted checks in SETUP.md, sign the Windows installers, test updates on a disposable installation, verify retention/backups, and finish any invoicing, refund, printing, and business-specific requirements for your deployment. This initial release does not claim regulatory invoicing or tax compliance.
