// Development-only design adapter. Vite removes its import from production builds.
import releaseNotes from "../../release-notes.json";
import {
  Command,
  can,
  type AdminData,
  type AppState,
  type Product,
  type Sale,
  type Tenant,
  type Lease,
} from "../domain/contracts";
const uid = () => crypto.randomUUID();
const date = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString();
export function makePreview(kind: "pos" | "developer") {
  const tenantId = uid(),
    userId = uid(),
    deviceId = uid();
  const tenants: Tenant[] = [
    "Northside General Store",
    "Daily Grind Coffee",
    "Mercado Fresh Market",
    "The Good Table",
    "Corner & Co.",
  ].map((name, i) => ({
    id: i === 0 ? tenantId : uid(),
    name,
    email: [
      "hello@northside.example",
      "owner@dailygrind.example",
      "admin@mercado.example",
      "hello@goodtable.example",
      "team@corner.example",
    ][i],
    business_type: (
      ["retail", "cafe", "grocery", "restaurant", "retail"] as const
    )[i],
    plan: i === 1 ? "starter" : "professional",
    paid_until: date([28, 5, 60, -3, 12][i]),
    offline_hours: 24,
    max_terminals: i === 1 ? 1 : 3,
    modules: ["pos", "inventory", "reports", "gcash"],
    status: i === 4 ? "disabled" : "active",
    created_at: date(-30 - i * 10),
    license_version: 1,
  }));
  const admin: AdminData = {
    tenants,
    members: tenants.map((t) => ({
      id: uid(),
      tenant_id: t.id,
      user_id: t.id === tenantId ? userId : uid(),
      email: t.email,
      role: "owner",
      enabled: true,
    })),
    devices: [],
    audit: [],
  };
  const license: Lease = {
    tenantId,
    userId,
    deviceId,
    tenantName: tenants[0].name,
    role: "owner",
    modules: ["pos", "inventory", "reports", "gcash"],
    version: 1,
    paidUntil: Date.now() / 1000 + 28 * 86400,
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 86400,
  };
  const state: AppState = {
    kind,
    version: releaseNotes.version,
    configured: true,
    missing: [],
    user: {
      id: userId,
      email:
        kind === "developer"
          ? "charles@omnipos.example"
          : "owner@northside.example",
    },
    license: kind === "pos" ? license : null,
    blockedReason: null,
    online: true,
    deviceId,
    update: {
      status: "idle",
      message: "Development preview. No release has been published.",
    },
    preview: true,
  };
  const products: Product[] = [
    ["House blend coffee", "Beverages", 9500, 48],
    ["Iced matcha latte", "Beverages", 14500, 24],
    ["Butter croissant", "Bakery", 8500, 18],
    ["Sourdough loaf", "Bakery", 18000, 12],
    ["Oat milk · 1L", "Grocery", 16500, 32],
    ["Mineral water", "Beverages", 2500, 80],
    ["Dark chocolate", "Grocery", 12000, 25],
    ["Almond cookie", "Bakery", 4500, 35],
  ].map((p, i) => ({
    id: uid(),
    name: p[0] as string,
    category: p[1] as string,
    price: p[2] as number,
    stock: p[3] as number,
    barcode: `480000000${i}`,
  }));
  const sales: Sale[] = [];
  return {
    async invoke<T>(raw: Command): Promise<T> {
      const c = Command.parse(raw);
      let result: unknown = { ok: true };
      if (c.action === "app.state" || c.action === "license.refresh")
        result = state;
      else if (c.action === "auth.login") {
        state.user = { id: userId, email: c.credentials.email };
        result = state;
      } else if (c.action === "auth.logout") {
        state.user = null;
        result = state;
      } else if (c.action === "admin.list") result = admin;
      else if (c.action === "admin.createTenant") {
        const t = {
          ...c.tenant,
          id: uid(),
          status: "active" as const,
          created_at: date(0),
          license_version: 1,
        };
        tenants.unshift(t);
        admin.members.push({
          id: uid(),
          tenant_id: t.id,
          user_id: uid(),
          email: c.account.email,
          role: c.account.role,
          enabled: true,
        });
      } else if (c.action === "admin.updateTenant")
        Object.assign(
          tenants.find((t) => t.id === c.id)!,
          c.tenant,
        );
      else if (c.action === "admin.status")
        tenants.find((t) => t.id === c.id)!.status = c.status;
      else if (c.action === "admin.createUser")
        admin.members.push({
          id: uid(),
          tenant_id: c.tenantId,
          user_id: uid(),
          email: c.account.email,
          role: c.account.role,
          enabled: true,
        });
      else if (c.action === "admin.updateUser")
        Object.assign(
          admin.members.find((m) => m.id === c.id)!,
          { role: c.role, enabled: c.enabled },
        );
      else if (c.action === "pos.beginSale") result = { id: uid() };
      else if (c.action === "pos.state")
        result = { products, sales, pending: sales.length };
      else if (c.action === "pos.product") {
        const p = products.find((p) => p.id === c.product.id);
        if (p) Object.assign(p, c.product);
        else products.push(c.product);
      } else if (c.action === "pos.checkout") {
        if (!can(license.role, "checkout")) throw new Error("No access");
        const items = c.checkout.items.map((i) => {
          const p = products.find((p) => p.id === i.productId)!;
          if (p.stock < i.quantity) throw new Error("Insufficient stock");
          return {
            productId: p.id,
            name: p.name,
            quantity: i.quantity,
            unitPrice: p.price,
            total: p.price * i.quantity,
          };
        });
        const total = items.reduce((a, i) => a + i.total, 0);
        if (c.checkout.tendered < total)
          throw new Error("Payment is insufficient");
        for (const i of items)
          products.find((p) => p.id === i.productId)!.stock -= i.quantity;
        const sale: Sale = {
          id: c.checkout.id,
          tenantId,
          userId,
          deviceId,
          createdAt: date(0),
          items,
          total,
          tendered: c.checkout.tendered,
          change: c.checkout.tendered - total,
          method: c.checkout.method,
          reference: c.checkout.reference,
        };
        sales.unshift(sale);
        result = sale;
      } else if (c.action === "update.preferences") {
        state.update.autoOptional = c.autoOptional;
        result = state.update;
      } else if (c.action.startsWith("update.")) {
        result = {
          status: "unconfigured",
          message: "Updates are available in installed builds.",
        };
      } else if (c.action === "pos.sync")
        throw new Error("Preview has no cloud connection.");
      if (c.action.startsWith("admin.") && c.action !== "admin.list")
        admin.audit.unshift({
          id: uid(),
          actor_id: userId,
          tenant_id: null,
          action: c.action,
          created_at: date(0),
          details: {},
        });
      return structuredClone(result) as T;
    },
  };
}
