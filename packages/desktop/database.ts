import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  Checkout,
  ProductInput,
  type Lease,
  type Product,
  type PosData,
  type Sale,
  type CheckoutInput,
} from "../domain/contracts";

export class LocalDatabase {
  db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS products (tenant_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, barcode TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0), stock INTEGER NOT NULL CHECK(stock >= 0), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,barcode));
      CREATE TABLE IF NOT EXISTS sales (tenant_id TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT NOT NULL, request_hash TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(tenant_id,id));
      CREATE TABLE IF NOT EXISTS outbox (tenant_id TEXT NOT NULL, sale_id TEXT NOT NULL, lease TEXT NOT NULL, PRIMARY KEY(tenant_id,sale_id), FOREIGN KEY(tenant_id,sale_id) REFERENCES sales(tenant_id,id));
      CREATE INDEX IF NOT EXISTS sales_tenant_date ON sales(tenant_id,created_at);
      PRAGMA user_version = 1;
    `);
  }
  get(key: string) {
    return (
      this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  set(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  remove(key: string) {
    this.db.prepare("DELETE FROM meta WHERE key = ?").run(key);
  }
  products(tenantId: string): Product[] {
    return this.db
      .prepare(
        "SELECT id,name,barcode,category,price,stock FROM products WHERE tenant_id=? ORDER BY name",
      )
      .all(tenantId) as Product[];
  }
  saveProduct(tenantId: string, input: Product) {
    const p = ProductInput.parse(input);
    this.db
      .prepare(
        "INSERT INTO products(tenant_id,id,name,barcode,category,price,stock) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,category=excluded.category,price=excluded.price,stock=excluded.stock",
      )
      .run(tenantId, p.id, p.name, p.barcode, p.category, p.price, p.stock);
  }
  state(tenantId: string, userId: string, reports: boolean): PosData {
    const rows = reports
      ? this.db
          .prepare(
            "SELECT data FROM sales WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200",
          )
          .all(tenantId)
      : this.db
          .prepare(
            "SELECT data FROM sales WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50",
          )
          .all(tenantId, userId);
    return {
      products: this.products(tenantId),
      sales: (rows as { data: string }[]).map((r) => JSON.parse(r.data)),
      pending: (
        this.db
          .prepare("SELECT count(*) AS n FROM outbox WHERE tenant_id=?")
          .get(tenantId) as { n: number }
      ).n,
    };
  }
  checkout(
    input: CheckoutInput,
    license: Lease,
    token: string,
    now: number,
  ): Sale {
    const request = Checkout.parse(input);
    if (now >= Math.min(license.exp, license.paidUntil) * 1000)
      throw new Error("License expired");
    const hash = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    return this.db.transaction(() => {
      const prior = this.db
        .prepare(
          "SELECT data,request_hash,user_id FROM sales WHERE tenant_id=? AND id=?",
        )
        .get(license.tenantId, request.id) as
        { data: string; request_hash: string; user_id: string } | undefined;
      if (prior) {
        if (prior.request_hash !== hash || prior.user_id !== license.userId)
          throw new Error("Checkout identifier already used");
        return JSON.parse(prior.data) as Sale;
      }
      const items = request.items.map((line) => {
        const p = this.db
          .prepare("SELECT * FROM products WHERE tenant_id=? AND id=?")
          .get(license.tenantId, line.productId) as Product | undefined;
        if (!p) throw new Error("Product no longer exists");
        if (p.stock < line.quantity)
          throw new Error(`Insufficient stock: ${p.name}`);
        return {
          productId: p.id,
          name: p.name,
          quantity: line.quantity,
          unitPrice: p.price,
          total: p.price * line.quantity,
        };
      });
      const total = items.reduce((s, i) => s + i.total, 0);
      if (!Number.isSafeInteger(total) || total > 1_000_000_000)
        throw new Error("Sale total exceeds supported limit");
      if (request.tendered < total)
        throw new Error("Payment does not cover the total");
      if (request.method === "gcash" && request.tendered !== total)
        throw new Error("GCash must match the exact total");
      const sale: Sale = {
        id: request.id,
        tenantId: license.tenantId,
        userId: license.userId,
        deviceId: license.deviceId,
        createdAt: new Date(now).toISOString(),
        items,
        total,
        method: request.method,
        tendered: request.tendered,
        change: request.tendered - total,
        ...(request.reference ? { reference: request.reference } : {}),
      };
      for (const i of items)
        this.db
          .prepare(
            "UPDATE products SET stock=stock-? WHERE tenant_id=? AND id=?",
          )
          .run(i.quantity, license.tenantId, i.productId);
      this.db
        .prepare("INSERT INTO sales VALUES(?,?,?,?,?,?)")
        .run(
          license.tenantId,
          sale.id,
          license.userId,
          hash,
          JSON.stringify(sale),
          sale.createdAt,
        );
      this.db
        .prepare("INSERT INTO outbox VALUES(?,?,?)")
        .run(license.tenantId, sale.id, token);
      return sale;
    })();
  }
  pending(tenantId: string): { sale: Sale; license: string }[] {
    return (
      this.db
        .prepare(
          "SELECT s.data,o.lease FROM outbox o JOIN sales s ON s.tenant_id=o.tenant_id AND s.id=o.sale_id WHERE o.tenant_id=? ORDER BY s.created_at LIMIT 50",
        )
        .all(tenantId) as { data: string; lease: string }[]
    ).map((r) => ({ sale: JSON.parse(r.data), license: r.lease }));
  }
  acknowledge(tenantId: string, ids: string[]) {
    this.db.transaction(() => {
      for (const id of ids)
        this.db
          .prepare("DELETE FROM outbox WHERE tenant_id=? AND sale_id=?")
          .run(tenantId, id);
    })();
  }
  close() {
    this.db.close();
  }
}
