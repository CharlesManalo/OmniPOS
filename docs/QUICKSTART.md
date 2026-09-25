# Your first client

## 1. Open the Developer app

Download `OmniPOS-Developer-Setup-0.1.1.exe` from the [GitHub release page](https://github.com/CharlesManalo/OmniPOS/releases) and install **OmniPOS Developer**. These first installers are unsigned; verify the source before approving any Windows warning.

Open `.secrets/developer-login.json` locally for your initial email and password. Sign in to Developer, open **Updates & account**, and change the password. Save the new password in a password manager. Do not send the private credential file to clients or upload it to GitHub.

## 2. Create a client

Choose **New client**. Fill in the business name, contact email, business type and account plan. Set **Paid access expires (local time)** to the renewal deadline you agreed with the client. Choose the terminal limit and modules; keep the offline allowance at 24 hours or lower.

Under **First client account**, enter the client's sign-in email, role and a unique initial password of at least 12 characters. Start with an `owner` account if they need to manage products and reports; a `cashier` cannot edit inventory. Include the inventory module if the client will maintain their own local catalog.

Share only that client's credentials through a secure channel. They can change their password after signing in.

## 3. Install the client POS

Run `OmniPOS-Setup-0.1.1.exe` from the same release on the client's Windows PC. Sign in with the **client** account, not your developer account. The first sign-in requires internet and registers a terminal against its limit. Add products/stock on that terminal and test checkout.

Stock and catalogs are local to each terminal in this initial version. Cloud sale backup does not synchronize inventory across multiple terminals. GCash recording requires the operator to independently verify payment; entering a reference does not verify payment with GCash.

## 4. Manage renewals and access

Use **Clients & tenants** or **Subscriptions** in Developer to edit the paid expiry, change modules/plans, disable or re-enable access. Re-enabling does not extend an expired subscription: update the expiry separately. Deletion is recoverable and requires the exact business name; it preserves records.

Online POS terminals recheck about every five minutes, or when **Verify license** is chosen. Offline access ends at the earlier of the signed 24-hour deadline and the paid expiry. An offline PC cannot receive an immediate remote disable command.

## 5. Publish updates

Follow [RELEASING.md](RELEASING.md). Choose **optional** or **required** when running the release workflow. Both Windows apps and separate update manifests must be included in every release. Configure Windows signing before broad distribution.

On the client, **Updates** offers **Update now** and a switch for automatic optional updates. A downloaded, selected update waits until no sale is open, gives 15 seconds' notice, then closes and reopens the app. Optional downloaded updates can be postponed with **Later**. Required updates block new sales once detected, while an already-open sale may finish. The bottom-left **What's new** button opens patch notes offline.
