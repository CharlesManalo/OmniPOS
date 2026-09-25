import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { importPKCS8, importSPKI, SignJWT, jwtVerify } from "jose";
import {
  CloudCommand,
  License,
  can,
  uuid,
  money,
} from "../../../packages/domain/contracts.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const saleSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    userId: uuid,
    deviceId: uuid,
    createdAt: z.string().datetime(),
    total: money,
    tendered: money,
    change: money,
    method: z.enum(["cash", "gcash"]),
    reference: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    items: z
      .array(
        z
          .object({
            productId: uuid,
            name: z.string().max(120),
            quantity: z.number().int().min(1).max(1000),
            unitPrice: money,
            total: money,
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
const backupSchema = z
  .object({
    action: z.literal("pos.backup"),
    entries: z
      .array(
        z.object({ sale: saleSchema, license: z.string().max(8192) }).strict(),
      )
      .max(50),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return reply({ error: "Sign in required" }, 401);
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !user)
      return reply({ error: "Session invalid. Sign in again." }, 401);
    if (Number(req.headers.get("content-length") ?? 0) > 2_000_000)
      return reply({ error: "Request too large" }, 413);
    const text = await req.text();
    if (text.length > 2_000_000)
      return reply({ error: "Request too large" }, 413);
    const raw = JSON.parse(text);

    if (raw.action === "pos.backup") {
      const body = backupSchema.parse(raw);
      const { data: member, error } = await admin
        .from("omni_members")
        .select("tenant_id,enabled")
        .eq("user_id", user.id)
        .single();
      if (error || !member?.enabled)
        return reply({ error: "Account unavailable" }, 403);
      const publicKey = await importSPKI(
        atob(Deno.env.get("OMNIPOS_LICENSE_PUBLIC_KEY")!),
        "EdDSA",
      );
      const ids: string[] = [];
      for (const entry of body.entries) {
        const sale = entry.sale;
        const saleTime = new Date(sale.createdAt);
        const { payload } = await jwtVerify(entry.license, publicKey, {
          algorithms: ["EdDSA"],
          issuer: "omnipos",
          audience: "omnipos-pos",
          currentDate: saleTime,
          clockTolerance: 0,
        });
        const lease = License.parse(payload);
        if (
          lease.tenantId !== member.tenant_id ||
          sale.tenantId !== lease.tenantId ||
          sale.userId !== lease.userId ||
          sale.deviceId !== lease.deviceId ||
          !can(lease.role, "checkout") ||
          !lease.modules.includes("pos")
        )
          return reply({ error: "Sale license mismatch" }, 403);
        if (
          saleTime.getTime() < lease.iat * 1000 ||
          saleTime.getTime() > Date.now() + 30_000
        )
          return reply({ error: "Invalid sale time" }, 400);
        if (
          sale.method === "gcash" &&
          (!lease.modules.includes("gcash") ||
            !sale.reference ||
            sale.change !== 0)
        )
          return reply({ error: "Invalid GCash payment" }, 400);
        if (
          sale.items.some((i) => i.total !== i.unitPrice * i.quantity) ||
          sale.total !== sale.items.reduce((a, i) => a + i.total, 0) ||
          sale.tendered - sale.total !== sale.change
        )
          return reply({ error: "Invalid sale totals" }, 400);
        const { error: saveError } = await admin
          .from("omni_sales")
          .upsert(
            {
              tenant_id: sale.tenantId,
              id: sale.id,
              user_id: sale.userId,
              device_id: sale.deviceId,
              total: sale.total,
              sale,
              created_at: sale.createdAt,
            },
            { onConflict: "tenant_id,id", ignoreDuplicates: true },
          );
        if (saveError) throw new Error("Could not back up sales");
        ids.push(sale.id);
      }
      return reply({ ids });
    }

    const command = CloudCommand.parse(raw);
    if (command.action === "license.issue") {
      const { data, error } = await admin.rpc("omni_issue_context", {
        p_user: user.id,
        p_device: command.deviceId,
      });
      if (error)
        return reply(
          {
            error:
              error.code === "42501"
                ? error.message
                : "License service unavailable",
          },
          error.code === "42501" ? 403 : 503,
        );
      const { tenant, member, server_time: now } = data;
      const exp = Math.min(
        Math.floor(new Date(tenant.paid_until).getTime() / 1000),
        now + Math.max(300, tenant.offline_hours * 3600),
      );
      const key = await importPKCS8(
        atob(Deno.env.get("OMNIPOS_LICENSE_PRIVATE_KEY")!),
        "EdDSA",
      );
      const token = await new SignJWT({
        tenantId: tenant.id,
        tenantName: tenant.name,
        userId: user.id,
        deviceId: command.deviceId,
        role: member.role,
        modules: tenant.modules,
        version: tenant.license_version,
        paidUntil: Math.floor(new Date(tenant.paid_until).getTime() / 1000),
      })
        .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
        .setIssuer("omnipos")
        .setAudience("omnipos-pos")
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .sign(key);
      return reply({ token });
    }

    const { data: developer, error: developerError } = await admin
      .from("omni_developers")
      .select("enabled")
      .eq("user_id", user.id)
      .single();
    if (developerError || !developer?.enabled)
      return reply({ error: "Developer access required" }, 403);
    if (command.action === "admin.list") {
      // Explicit paging avoids silently losing tenants at the PostgREST 1,000-row default.
      async function all(table: string, order: string) {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await admin
            .from(table)
            .select("*")
            .order(order)
            .range(offset, offset + 499);
          if (result.error) throw new Error("Could not load developer data");
          rows.push(...result.data);
          if (result.data.length < 500) return rows;
        }
      }
      const [tenants, members, devices, auditResult] = await Promise.all([
        all("omni_tenants", "id"),
        all("omni_members", "id"),
        all("omni_devices", "device_id"),
        admin
          .from("omni_audit")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (auditResult.error) throw new Error("Could not load audit log");
      return reply({ tenants, members, devices, audit: auditResult.data });
    }
    let createdUser: string | undefined;
    const payload: Record<string, unknown> = { ...command };
    if (
      command.action === "admin.createTenant" ||
      command.action === "admin.createUser"
    ) {
      const { data, error } = await admin.auth.admin.createUser({
        email: command.account.email,
        password: command.account.password,
        email_confirm: true,
      });
      if (error) return reply({ error: error.message }, 400);
      createdUser = data.user.id;
      payload.user_id = createdUser;
      payload.account = {
        email: command.account.email,
        role: command.account.role,
      };
    }
    const { data, error } = await admin.rpc("omni_admin_mutate", {
      p_actor: user.id,
      p_action: command.action,
      p_data: payload,
    });
    if (error) {
      if (createdUser) {
        const { error: cleanupError } =
          await admin.auth.admin.deleteUser(createdUser);
        if (cleanupError)
          console.error(
            "Unlinked account requires operator cleanup",
            createdUser,
          );
      }
      return reply(
        {
          error:
            error.code === "42501"
              ? "Developer access required"
              : error.message,
        },
        400,
      );
    }
    return reply(data);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return reply(
        { error: "Invalid request. Check the entered fields." },
        400,
      );
    if (
      error instanceof Error &&
      (error.name.startsWith("JWT") || error.name.startsWith("JWS"))
    )
      return reply({ error: "Invalid license proof" }, 403);
    console.error("Control-plane request failed");
    return reply(
      { error: "Server operation failed. Check deployment configuration." },
      500,
    );
  }
});
