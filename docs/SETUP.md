# Activate the cloud backend

Target project: `yhovrmjbtwwnzmsrdnja`. CLI authentication was verified and the initial migration, signing secrets, and Edge Function were deployed on 2026-09-25. Public signup is disabled. See [deployment status](DEPLOYMENT.md). The following instructions reproduce the setup; do not regenerate the existing signing identity or reapply an already-recorded migration.

## 1. Authenticate locally

Use a new scoped Supabase management token restricted to this project and the permissions needed for deployment. Keep it in your local environment or credential manager, never in a desktop build or GitHub source. The application login is separate from Codex MCP authentication.

The Supabase CLI uses `SUPABASE_ACCESS_TOKEN` when set. Alternatively run `npx supabase login` and complete the browser flow. That browser flow may grant wider account access; scoped tokens are preferable for automation.

In VS Code, choose Terminal → New Terminal, run `npx supabase login`, open the displayed browser link if necessary, sign in, and follow the verification prompt. Verify access with `npx supabase projects list`. Never paste access tokens in chat. CLI login and Codex MCP login are separate.

## 2. Apply the schema

Review `supabase/migrations/20260924134911_omnipos_control_plane.sql`. It creates only `omni_*` objects. Back up any existing project data and review before applying to an existing production project.

For a new project:

```powershell
npx supabase link --project-ref yhovrmjbtwwnzmsrdnja
npx supabase db push
```

You can instead run the migration in the Supabase SQL Editor. If you use that route, reconcile migration history before later using `db push` so the same initial migration is not applied twice. Configure the hosted Auth settings to **disable public signups**. The local `config.toml` setting alone does not change the hosted project.

## 3. Create the signing identity

```powershell
npm run keys:generate
npx supabase secrets set --project-ref yhovrmjbtwwnzmsrdnja --env-file .secrets/supabase-secrets.env
```

The generator refuses to overwrite existing keys. Back up `.secrets/license-private.pem` securely. The Edge Function receives the private signing key and public verification key. Desktop apps receive only the public key. Rotating keys requires a coordinated desktop update, so retain the original identity across ordinary releases.

## 4. Deploy the Edge Function

```powershell
npx supabase functions deploy control-plane --project-ref yhovrmjbtwwnzmsrdnja --use-api
```

`verify_jwt = false` is intentional: the handler explicitly calls `auth.getUser(bearerToken)` for **every request**, supporting asymmetric Supabase tokens as well as legacy tokens. It rejects unauthenticated requests and checks the live developer allowlist before all administration actions. Never remove this application-level verification.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions. These are never desktop settings.

## 5. Bootstrap your developer account

The initial developer account has already been created. Its initial credentials are in the ignored, Windows-ACL-restricted `.secrets/developer-login.json` file. Open it locally, sign into **OmniPOS Developer**, and change the password through the app. Store it in a password manager and remove the initial credential file after finishing verification. This is a separate login from the Supabase dashboard.

For another trusted developer, use `node scripts/bootstrap-developer.mjs <email>` with a locally authenticated privileged CLI. This does not change an existing account's password. When creating a new account, it refuses to reuse an initial-credential file belonging to another email. Alternatively, create the account in Supabase Dashboard → Authentication → Users, then use its UUID in the SQL Editor:

```sql
insert into public.omni_developers(user_id, enabled)
values ('REPLACE_WITH_YOUR_AUTH_USER_UUID'::uuid, true)
on conflict (user_id) do update set enabled = true;
```

Developer rights cannot be assigned through user-editable metadata or the desktop client. Creating another developer requires this privileged bootstrap operation. A client account is not a developer, even if the client possesses the Developer installer.

## 6. Configure public desktop settings

Create `.env` from `.env.example` in your editor. Fill in:

- `OMNIPOS_SUPABASE_URL`: the supplied project URL.
- `OMNIPOS_SUPABASE_PUBLISHABLE_KEY`: the project’s publishable key (or legacy anon key), from Dashboard → Settings → API keys.
- `OMNIPOS_LICENSE_PUBLIC_KEY`: the single-line value in `.secrets/desktop-public.env`.

Keep `OMNIPOS_GITHUB_OWNER=CharlesManalo` and `OMNIPOS_GITHUB_REPO=OmniPOS`. Do not use a service-role key, management token, or private signing key in `.env`. The build rejects recognized secret-key formats.

```powershell
npm run check
npm run test:desktop
npm run test:integration
npm run package
npm run release:prepare -- optional
npm run verify:packages
npm run test:packaged
```

Install Developer and sign in. Create a test client with a future expiry, inventory entitlement, and owner account. Install POS and sign in with that client account. Add a product and test a sale. Both executables must be rebuilt after changing public build settings.

## 7. Verify the live installation

1. Confirm a client cannot sign into Developer or modify another tenant.
2. Disable the test client; use **Verify license** in POS and confirm it locks.
3. Re-enable it without changing an expired date; confirm it stays locked. Extend the expiry and recheck to restore access.
4. Disconnect the network after a valid login. Confirm sales still save locally. The signed deadline must not exceed the paid date.
5. Reconnect and back up a sale; confirm it appears in `omni_sales` exactly once.
6. Test terminal limits and role restrictions on real separate installations.
7. Run Supabase security advisors and review findings before onboarding paying customers.

Local automated tests cover the logic and PostgreSQL grants. They do not replace these hosted-project checks. Supabase documentation: [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
