import { z } from "zod";

export const roles = ["owner", "manager", "cashier", "auditor"] as const;
export const businessTypes = [
  "retail",
  "grocery",
  "cafe",
  "restaurant",
] as const;
export const moduleNames = ["pos", "inventory", "reports", "gcash"] as const;
export const Role = z.enum(roles);
export const Module = z.enum(moduleNames);
export const uuid = z.string().uuid();
export const money = z.number().int().min(0).max(1_000_000_000);
export const Credentials = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();
export const Account = Credentials.extend({
  password: z.string().min(12).max(128),
  role: Role,
});
export const TenantInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    business_type: z.enum(businessTypes),
    plan: z.enum(["starter", "professional", "enterprise", "custom"]),
    paid_until: z.string().datetime(),
    offline_hours: z.number().int().min(0).max(24),
    max_terminals: z.number().int().min(1).max(100),
    modules: z
      .array(Module)
      .min(1)
      .max(4)
      .refine(
        (v) => new Set(v).size === v.length && v.includes("pos"),
        "Include POS, with no duplicate modules",
      ),
  })
  .strict();
export const ProductInput = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(120),
    barcode: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(60),
    price: money,
    stock: z.number().int().min(0).max(1_000_000),
  })
  .strict();
export const Checkout = z
  .object({
    id: uuid,
    items: z
      .array(
        z
          .object({
            productId: uuid,
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    method: z.enum(["cash", "gcash"]),
    tendered: money,
    reference: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.method === "gcash" && !v.reference)
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter exactly four reference digits",
      });
    if (new Set(v.items.map((i) => i.productId)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Duplicate cart lines",
      });
  });
export const License = z
  .object({
    tenantId: uuid,
    userId: uuid,
    deviceId: uuid,
    tenantName: z.string(),
    role: Role,
    modules: z.array(Module),
    version: z.number().int().positive(),
    paidUntil: z.number().int().positive(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .refine(
    (v) => v.exp <= v.paidUntil && v.exp <= v.iat + 86400 && v.exp > v.iat,
    "Invalid license duration",
  );
export const CloudCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("admin.list") }).strict(),
  z
    .object({
      action: z.literal("admin.createTenant"),
      tenant: TenantInput,
      account: Account,
    })
    .strict(),
  z
    .object({
      action: z.literal("admin.updateTenant"),
      id: uuid,
      tenant: TenantInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("admin.status"),
      id: uuid,
      status: z.enum(["active", "disabled", "deleted"]),
      confirmName: z.string().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("admin.createUser"),
      tenantId: uuid,
      account: Account,
    })
    .strict(),
  z
    .object({
      action: z.literal("admin.updateUser"),
      id: uuid,
      role: Role,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("admin.revokeDevice"),
      tenantId: uuid,
      deviceId: uuid,
    })
    .strict(),
  z.object({ action: z.literal("license.issue"), deviceId: uuid }).strict(),
]);
export const Command = z.union([
  CloudCommand,
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("app.state") }).strict(),
    z
      .object({ action: z.literal("auth.login"), credentials: Credentials })
      .strict(),
    z.object({ action: z.literal("auth.logout") }).strict(),
    z
      .object({
        action: z.literal("auth.password"),
        password: z.string().min(12).max(128),
      })
      .strict(),
    z.object({ action: z.literal("license.refresh") }).strict(),
    z.object({ action: z.literal("pos.state") }).strict(),
    z.object({ action: z.literal("pos.beginSale") }).strict(),
    z.object({ action: z.literal("pos.cancelSale"), id: uuid }).strict(),
    z
      .object({ action: z.literal("pos.product"), product: ProductInput })
      .strict(),
    z
      .object({ action: z.literal("pos.checkout"), checkout: Checkout })
      .strict(),
    z.object({ action: z.literal("pos.sync") }).strict(),
    z.object({ action: z.literal("pos.export") }).strict(),
    z.object({ action: z.literal("update.check") }).strict(),
    z.object({ action: z.literal("update.download") }).strict(),
    z
      .object({
        action: z.literal("update.preferences"),
        autoOptional: z.boolean(),
      })
      .strict(),
    z.object({ action: z.literal("update.defer") }).strict(),
    z
      .object({ action: z.literal("update.install"), cartEmpty: z.boolean() })
      .strict(),
  ]),
]);
export type Command = z.infer<typeof Command>;
export type TenantInput = z.infer<typeof TenantInput>;
export type Role = z.infer<typeof Role>;
export type Entitlement = z.infer<typeof Module>;
export type Lease = z.infer<typeof License>;
export type Product = z.infer<typeof ProductInput>;
export type CheckoutInput = z.infer<typeof Checkout>;
export type Tenant = TenantInput & {
  id: string;
  status: "active" | "disabled" | "deleted";
  created_at: string;
  license_version: number;
};
export type Member = {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  role: Role;
  enabled: boolean;
};
export type Device = {
  tenant_id: string;
  device_id: string;
  last_seen: string;
  enabled: boolean;
};
export type Audit = {
  id: string;
  actor_id: string;
  tenant_id: string | null;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
};
export type AdminData = {
  tenants: Tenant[];
  members: Member[];
  devices: Device[];
  audit: Audit[];
};
export type Sale = {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  createdAt: string;
  total: number;
  tendered: number;
  change: number;
  method: "cash" | "gcash";
  reference?: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
};
export type PosData = { products: Product[]; sales: Sale[]; pending: number };
export type UpdateState = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "current"
    | "error"
    | "unconfigured";
  message: string;
  version?: string;
  progress?: number;
  required?: boolean;
  minimumVersion?: string;
  autoOptional?: boolean;
  releaseNotes?: string;
  restartAt?: number;
};
export type AppState = {
  kind: "pos" | "developer";
  version: string;
  configured: boolean;
  missing: string[];
  user: { id: string; email: string } | null;
  license: Lease | null;
  blockedReason: string | null;
  online: boolean;
  deviceId: string;
  update: UpdateState;
  preview: boolean;
};
export const plans: Record<
  TenantInput["plan"],
  { modules: Entitlement[]; terminals: number }
> = {
  starter: { modules: ["pos", "inventory"], terminals: 1 },
  professional: {
    modules: ["pos", "inventory", "reports", "gcash"],
    terminals: 3,
  },
  enterprise: {
    modules: ["pos", "inventory", "reports", "gcash"],
    terminals: 10,
  },
  custom: { modules: ["pos"], terminals: 1 },
};
export function can(
  role: Role,
  operation: "checkout" | "inventory" | "reports",
) {
  return operation === "checkout"
    ? role !== "auditor"
    : operation === "inventory"
      ? ["owner", "manager"].includes(role)
      : role !== "cashier";
}
