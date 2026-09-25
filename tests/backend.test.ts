import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let pg: PGlite;
const developer = randomUUID(),
  owner = randomUUID(),
  other = randomUUID(),
  rogue = randomUUID();
let tenantId: string, otherId: string;
const tenant = {
  name: "Tenant A",
  email: "a@example.com",
  business_type: "retail",
  plan: "starter",
  paid_until: new Date(Date.now() + 86400000).toISOString(),
  offline_hours: 24,
  max_terminals: 1,
  modules: ["pos", "inventory"],
};
async function mutate(actor: string, action: string, data: unknown) {
  const r = await pg.query<{ result: { id: string } }>(
    "select public.omni_admin_mutate($1,$2,$3::jsonb) result",
    [actor, action, JSON.stringify(data)],
  );
  return r.rows[0].result;
}
async function asUser(user: string, sql: string) {
  await pg.exec("set role authenticated");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec("reset role");
  }
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
  );
  for (const user of [developer, owner, other, rogue])
    await pg.query("insert into auth.users values($1)", [user]);
  await pg.exec(
    readFileSync(
      "supabase/migrations/20260924134911_omnipos_control_plane.sql",
      "utf8",
    ),
  );
  await pg.query("insert into public.omni_developers(user_id) values($1)", [
    developer,
  ]);
  tenantId = (
    await mutate(developer, "admin.createTenant", {
      tenant,
      account: { email: "a@example.com", role: "owner" },
      user_id: owner,
    })
  ).id;
  otherId = (
    await mutate(developer, "admin.createTenant", {
      tenant: { ...tenant, name: "Tenant B" },
      account: { email: "b@example.com", role: "owner" },
      user_id: other,
    })
  ).id;
}, 60000);
afterAll(async () => {
  await pg?.close();
});
describe("Postgres tenant isolation and control plane", () => {
  it("applies the complete migration and enforces tenant-level RLS", async () => {
    const result = await asUser(owner, "select id from public.omni_tenants");
    expect(result.rows).toEqual([{ id: tenantId }]);
  });
  it("does not expose membership from another tenant", async () => {
    expect(
      (await asUser(owner, "select user_id from public.omni_members")).rows,
    ).toEqual([{ user_id: owner }]);
  });
  it("blocks direct client subscription extensions", async () => {
    await expect(
      asUser(
        owner,
        "update public.omni_tenants set paid_until=now()+interval '10 years'",
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("blocks self-promotion to developer", async () => {
    await expect(
      asUser(
        owner,
        `insert into public.omni_developers(user_id) values('${owner}')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies service RPC execution to client JWTs", async () => {
    await expect(
      asUser(
        owner,
        `select public.omni_issue_context('${owner}','${randomUUID()}')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("requires developer allowlist even for service mutation RPC", async () => {
    await expect(
      mutate(rogue, "admin.status", { id: tenantId, status: "disabled" }),
    ).rejects.toThrow(/Developer/);
  });
  it("registers a device and rejects extra terminals", async () => {
    const device = randomUUID();
    await pg.query("select public.omni_issue_context($1,$2)", [owner, device]);
    await pg.query("select public.omni_issue_context($1,$2)", [owner, device]);
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [
        owner,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Terminal limit/);
  });
  it("blocks disabled tenants immediately on the next check", async () => {
    await mutate(developer, "admin.status", {
      id: otherId,
      status: "disabled",
    });
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [
        other,
        randomUUID(),
      ]),
    ).rejects.toThrow(/disabled/);
    await mutate(developer, "admin.status", { id: otherId, status: "active" });
  });
  it("re-enable does not renew an expired account", async () => {
    await mutate(developer, "admin.updateTenant", {
      id: otherId,
      tenant: {
        ...tenant,
        name: "Tenant B",
        paid_until: new Date(Date.now() - 1000).toISOString(),
      },
    });
    await mutate(developer, "admin.status", {
      id: otherId,
      status: "disabled",
    });
    await mutate(developer, "admin.status", { id: otherId, status: "active" });
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [
        other,
        randomUUID(),
      ]),
    ).rejects.toThrow(/expired/);
  });
  it("renewal restores access", async () => {
    await mutate(developer, "admin.updateTenant", {
      id: otherId,
      tenant: { ...tenant, name: "Tenant B" },
    });
    expect(
      (
        await pg.query("select public.omni_issue_context($1,$2)", [
          other,
          randomUUID(),
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("requires exact-name confirmation for deletion and permits restoration", async () => {
    await expect(
      mutate(developer, "admin.status", {
        id: otherId,
        status: "deleted",
        confirmName: "wrong",
      }),
    ).rejects.toThrow(/Type/);
    await mutate(developer, "admin.status", {
      id: otherId,
      status: "deleted",
      confirmName: "Tenant B",
    });
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [
        other,
        randomUUID(),
      ]),
    ).rejects.toThrow(/disabled/);
    await mutate(developer, "admin.status", { id: otherId, status: "active" });
  });
  it("writes audit entries without passwords", async () => {
    const result = await pg.query<{ details: unknown }>(
      "select details from public.omni_audit",
    );
    expect(result.rows.length).toBeGreaterThan(5);
    expect(JSON.stringify(result.rows)).not.toContain("password");
  });
  it("keeps sales and audit hidden from direct client reads", async () => {
    await expect(
      asUser(owner, "select * from public.omni_sales"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(owner, "select * from public.omni_audit"),
    ).rejects.toThrow(/permission denied/);
  });
  it("disables and re-enables individual accounts", async () => {
    const row = await pg.query<{ id: string }>(
      "select id from public.omni_members where user_id=$1",
      [owner],
    );
    await mutate(developer, "admin.updateUser", {
      id: row.rows[0].id,
      role: "cashier",
      enabled: false,
    });
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [
        owner,
        randomUUID(),
      ]),
    ).rejects.toThrow(/disabled/);
    await mutate(developer, "admin.updateUser", {
      id: row.rows[0].id,
      role: "manager",
      enabled: true,
    });
    const devices = await pg.query<{ device_id: string }>(
      "select device_id from public.omni_devices where tenant_id=$1",
      [tenantId],
    );
    const result = await pg.query<{ context: { member: { role: string } } }>(
      "select public.omni_issue_context($1,$2) context",
      [owner, devices.rows[0].device_id],
    );
    expect(result.rows[0].context.member.role).toBe("manager");
  });
  it("revoked terminals cannot re-register and free a replacement slot", async () => {
    const devices = await pg.query<{ device_id: string }>(
      "select device_id from public.omni_devices where tenant_id=$1",
      [tenantId],
    );
    const deviceId = devices.rows[0].device_id;
    await mutate(developer, "admin.revokeDevice", { tenantId, deviceId });
    await expect(
      pg.query("select public.omni_issue_context($1,$2)", [owner, deviceId]),
    ).rejects.toThrow(/revoked/);
    expect(
      (
        await pg.query("select public.omni_issue_context($1,$2)", [
          owner,
          randomUUID(),
        ])
      ).rows,
    ).toHaveLength(1);
  });
});
