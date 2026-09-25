// Explicit, opt-in LIVE test. Creates disposable clients and removes only its own fixtures.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importSPKI, jwtVerify } from "jose";
import { _electron as electron } from "@playwright/test";
import { projectKeys, projectUrl, projectRef } from "./cloud-cli.mjs";

if (!process.argv.includes("--live"))
  throw new Error("Use --live to run against the hosted project");
const { publicKey, serviceKey } = await projectKeys();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(projectUrl, serviceKey, options);
const developer = createClient(projectUrl, publicKey, options);
const credentials = JSON.parse(
  await readFile(".secrets/developer-login.json", "utf8"),
);
const login = await developer.auth.signInWithPassword(credentials);
if (login.error)
  throw new Error(
    "Developer test login failed. Update the private test credentials if the password changed.",
  );
const developerToken = login.data.session.access_token;
const runId = randomUUID();
const fixtures = [];
let instance;
async function call(token, body, expected = 200) {
  const response = await fetch(`${projectUrl}/functions/v1/control-plane`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publicKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `${body.action}: expected ${expected}, got ${response.status}: ${result.error ?? ""}`,
  );
  return result;
}
const ownerCall = (body, status) => call(developerToken, body, status);
try {
  await call(null, { action: "admin.list" }, 401);
  const settings = await fetch(`${projectUrl}/auth/v1/settings`, {
    headers: { apikey: publicKey },
  });
  const settingsBody = await settings.json();
  assert.equal(settingsBody.disable_signup, true);
  for (let index = 0; index < 2; index++) {
    const email = `omnipos-smoke-${runId}-${index}@example.com`;
    const password = `Test!${randomBytes(24).toString("base64url")}`;
    const tenant = {
      name: `OmniPOS automated test ${runId}-${index}`,
      email,
      business_type: "retail",
      plan: "professional",
      paid_until: new Date(Date.now() + 2 * 86400_000).toISOString(),
      offline_hours: 24,
      max_terminals: 1,
      modules: ["pos", "inventory", "reports", "gcash"],
    };
    const created = await ownerCall({
      action: "admin.createTenant",
      tenant,
      account: { email, password, role: "owner" },
    });
    const fixture = { id: created.id, tenant, email, password };
    fixtures.push(fixture);
    const client = createClient(projectUrl, publicKey, options);
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error("Temporary client sign-in failed");
    Object.assign(fixture, {
      client,
      token: result.data.session.access_token,
      userId: result.data.user.id,
    });
  }
  const [first, second] = fixtures;
  const clientCall = (body, status) => call(first.token, body, status);
  await clientCall({ action: "admin.list" }, 403);
  const visible = await first.client.from("omni_tenants").select("id");
  assert.ifError(visible.error);
  assert.deepEqual(
    visible.data.map((t) => t.id),
    [first.id],
  );
  const grant = await first.client
    .from("omni_developers")
    .insert({ user_id: first.userId, enabled: true });
  assert.ok(grant.error, "Client could self-promote to developer");
  const mutate = await first.client.rpc("omni_admin_mutate", {
    p_actor: login.data.user.id,
    p_action: "admin.status",
    p_data: { id: second.id, status: "disabled" },
  });
  assert.ok(mutate.error, "Client could call privileged RPC directly");
  console.log(
    "LIVE: sign-in, public-signup lock, developer authorization and cross-tenant RLS PASS",
  );

  const deviceId = randomUUID();
  const issued = await clientCall({ action: "license.issue", deviceId });
  const pem = await readFile(".secrets/license-public.pem", "utf8");
  const verified = await jwtVerify(
    issued.token,
    await importSPKI(pem, "EdDSA"),
    {
      algorithms: ["EdDSA"],
      issuer: "omnipos",
      audience: "omnipos-pos",
    },
  );
  assert.equal(verified.payload.tenantId, first.id);
  assert.equal(verified.payload.userId, first.userId);
  assert.equal(verified.payload.deviceId, deviceId);
  assert.ok(verified.payload.exp <= verified.payload.iat + 86400);
  assert.ok(verified.payload.exp <= verified.payload.paidUntil);
  await clientCall({ action: "license.issue", deviceId: randomUUID() }, 403);
  await ownerCall({ action: "admin.status", id: first.id, status: "disabled" });
  await clientCall({ action: "license.issue", deviceId }, 403);
  const expired = {
    ...first.tenant,
    paid_until: new Date(Date.now() - 60_000).toISOString(),
  };
  await ownerCall({
    action: "admin.updateTenant",
    id: first.id,
    tenant: expired,
  });
  await ownerCall({ action: "admin.status", id: first.id, status: "active" });
  await clientCall({ action: "license.issue", deviceId }, 403);
  const renewed = {
    ...first.tenant,
    paid_until: new Date(Date.now() + 2 * 3600_000).toISOString(),
  };
  await ownerCall({
    action: "admin.updateTenant",
    id: first.id,
    tenant: renewed,
  });
  const shortLease = await clientCall({ action: "license.issue", deviceId });
  const checked = await jwtVerify(
    shortLease.token,
    await importSPKI(pem, "EdDSA"),
  );
  assert.equal(
    checked.payload.exp,
    Math.floor(Date.parse(renewed.paid_until) / 1000),
  );
  await ownerCall(
    {
      action: "admin.status",
      id: first.id,
      status: "deleted",
      confirmName: "wrong",
    },
    400,
  );
  await ownerCall({
    action: "admin.status",
    id: first.id,
    status: "deleted",
    confirmName: first.tenant.name,
  });
  await clientCall({ action: "license.issue", deviceId }, 403);
  await ownerCall({ action: "admin.status", id: first.id, status: "active" });
  await ownerCall({
    action: "admin.revokeDevice",
    tenantId: first.id,
    deviceId,
  });
  await clientCall({ action: "license.issue", deviceId }, 403);
  console.log(
    "LIVE: signed 24-hour/paid-expiry cap, terminal limits, disable, expired re-enable, renewal, delete/restore and terminal revocation PASS",
  );

  const environment = {
    ...process.env,
    OMNIPOS_TEST_DATA: await mkdtemp(join(tmpdir(), "omnipos-hosted-")),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  instance = await electron.launch({
    args: ["dist/pos/main.cjs"],
    env: environment,
  });
  const page = await instance.firstWindow();
  await page
    .getByRole("heading", { name: "Sign in to your workspace" })
    .waitFor();
  const invoke = (command) =>
    page.evaluate((command) => window.omni.invoke(command), command);
  const state = await invoke({
    action: "auth.login",
    credentials: { email: first.email, password: first.password },
  });
  assert.equal(state.license?.tenantId, first.id);
  const productId = randomUUID();
  await invoke({
    action: "pos.product",
    product: {
      id: productId,
      name: "Hosted test product",
      barcode: "HOSTED-TEST",
      category: "Test",
      price: 12500,
      stock: 5,
    },
  });
  const checkout = {
    id: randomUUID(),
    items: [{ productId, quantity: 2 }],
    method: "gcash",
    tendered: 25000,
    reference: "0042",
  };
  const sale = await invoke({ action: "pos.checkout", checkout });
  const retry = await invoke({ action: "pos.checkout", checkout });
  assert.equal(sale.id, retry.id);
  const local = await invoke({ action: "pos.state" });
  assert.equal(local.products[0].stock, 3);
  const synced = await invoke({ action: "pos.sync" });
  assert.equal(synced.synced, 1);
  const saved = await admin
    .from("omni_sales")
    .select("sale")
    .eq("tenant_id", first.id)
    .eq("id", sale.id)
    .single();
  assert.ifError(saved.error);
  assert.equal(saved.data.sale.reference, "0042");
  assert.equal(saved.data.sale.total, 25000);
  assert.equal((await invoke({ action: "pos.state" })).pending, 0);
  const portfolio = await ownerCall({ action: "admin.list" });
  const member = portfolio.members.find((m) => m.user_id === first.userId);
  await ownerCall({
    action: "admin.updateUser",
    id: member.id,
    enabled: false,
    role: "cashier",
  });
  assert.equal((await invoke({ action: "license.refresh" })).license, null);
  await assert.rejects(
    invoke({
      action: "pos.checkout",
      checkout: { ...checkout, id: randomUUID() },
    }),
  );
  await ownerCall({
    action: "admin.updateUser",
    id: member.id,
    enabled: true,
    role: "cashier",
  });
  assert.equal(
    (await invoke({ action: "license.refresh" })).license.role,
    "cashier",
  );
  await assert.rejects(
    invoke({
      action: "pos.product",
      product: {
        id: productId,
        name: "Forbidden",
        barcode: "HOSTED-TEST",
        category: "Test",
        price: 1,
        stock: 5,
      },
    }),
  );
  console.log(
    "LIVE: real Electron sign-in, SQLite sale, GCash 0042, idempotency, hosted backup and user role/disable enforcement PASS",
  );
} finally {
  if (instance) await instance.close();
  // Exact IDs from this run, additionally guarded by unique generated names.
  for (const fixture of fixtures) {
    const check = await admin
      .from("omni_tenants")
      .select("name")
      .eq("id", fixture.id)
      .single();
    if (
      check.error ||
      check.data.name !==
        `OmniPOS automated test ${runId}-${fixtures.indexOf(fixture)}`
    )
      throw new Error("Refusing fixture cleanup: tenant identity mismatch");
    const users = await admin
      .from("omni_members")
      .select("user_id,email")
      .eq("tenant_id", fixture.id);
    if (users.error || users.data.some((u) => u.email !== fixture.email))
      throw new Error("Refusing fixture cleanup: account identity mismatch");
    await fixture.client?.auth.signOut({ scope: "local" });
    for (const table of [
      "omni_sales",
      "omni_devices",
      "omni_audit",
      "omni_members",
    ]) {
      const result = await admin
        .from(table)
        .delete()
        .eq("tenant_id", fixture.id);
      if (result.error)
        throw new Error(`Could not clean temporary rows in ${table}`);
    }
    const removed = await admin
      .from("omni_tenants")
      .delete()
      .eq("id", fixture.id)
      .eq("name", check.data.name);
    if (removed.error) throw new Error("Could not clean temporary tenant");
    for (const user of users.data) {
      const removedUser = await admin.auth.admin.deleteUser(user.user_id);
      if (removedUser.error)
        throw new Error("Could not clean temporary auth user");
    }
  }
  await developer.auth.signOut({ scope: "local" });
  console.log(
    "Removed only this run's disposable test clients, accounts and sales. Developer account preserved.",
  );
}
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/hosted-verification.json",
  JSON.stringify(
    {
      projectRef,
      verifiedAt: new Date().toISOString(),
      result: "PASS",
      fixturesRemoved: fixtures.length,
    },
    null,
    2,
  ),
);
