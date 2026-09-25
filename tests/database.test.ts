import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { LocalDatabase } from "../packages/desktop/database";
import type {
  Lease,
  Product,
  CheckoutInput,
} from "../packages/domain/contracts";
import { toCentavos } from "../packages/domain/money";
let db: LocalDatabase, p: Product, lease: Lease, request: CheckoutInput;
beforeEach(() => {
  db = new LocalDatabase(":memory:");
  p = {
    id: randomUUID(),
    name: "Coffee",
    barcode: "0042",
    category: "Drink",
    price: 12550,
    stock: 10,
  };
  lease = {
    tenantId: randomUUID(),
    userId: randomUUID(),
    deviceId: randomUUID(),
    tenantName: "Shop",
    role: "owner",
    modules: ["pos"],
    version: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    paidUntil: Math.floor(Date.now() / 1000) + 86400,
  };
  db.saveProduct(lease.tenantId, p);
  request = {
    id: randomUUID(),
    items: [{ productId: p.id, quantity: 2 }],
    method: "cash",
    tendered: 30000,
  };
});
afterEach(() => db.close());
describe("local sale transactions", () => {
  it("commits exact totals, payment, inventory and backup outbox together", () => {
    const sale = db.checkout(request, lease, "signed", Date.now());
    expect(sale.total).toBe(25100);
    expect(sale.change).toBe(4900);
    expect(db.products(lease.tenantId)[0].stock).toBe(8);
    expect(db.pending(lease.tenantId)[0].sale.id).toBe(sale.id);
  });
  it("retries the same checkout without duplicating sales or deducting twice", () => {
    const first = db.checkout(request, lease, "signed", Date.now());
    expect(db.checkout(request, lease, "signed", Date.now())).toEqual(first);
    expect(db.products(lease.tenantId)[0].stock).toBe(8);
    expect(db.pending(lease.tenantId)).toHaveLength(1);
  });
  it("rejects a changed request reusing an id", () => {
    db.checkout(request, lease, "signed", Date.now());
    expect(() =>
      db.checkout({ ...request, tendered: 40000 }, lease, "signed", Date.now()),
    ).toThrow(/identifier/);
  });
  it("rolls back stock and sale if outbox insertion fails", () => {
    db.db.exec(
      "CREATE TRIGGER fail_backup BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'disk simulation'); END;",
    );
    expect(() => db.checkout(request, lease, "signed", Date.now())).toThrow();
    expect(db.products(lease.tenantId)[0].stock).toBe(10);
    expect(db.state(lease.tenantId, lease.userId, true).sales).toHaveLength(0);
  });
  it("rejects out-of-stock sale with no writes", () => {
    expect(() =>
      db.checkout(
        { ...request, items: [{ productId: p.id, quantity: 11 }] },
        lease,
        "signed",
        Date.now(),
      ),
    ).toThrow(/stock/);
    expect(db.pending(lease.tenantId)).toHaveLength(0);
  });
  it("rejects insufficient payment", () => {
    expect(() =>
      db.checkout({ ...request, tendered: 25000 }, lease, "signed", Date.now()),
    ).toThrow(/cover/);
    expect(db.products(lease.tenantId)[0].stock).toBe(10);
  });
  it("rejects products from another tenant", () => {
    expect(() =>
      db.checkout(
        request,
        { ...lease, tenantId: randomUUID() },
        "signed",
        Date.now(),
      ),
    ).toThrow(/no longer exists/);
  });
  it("does not leak another cashier’s sales without reporting access", () => {
    db.checkout(request, lease, "signed", Date.now());
    expect(db.state(lease.tenantId, randomUUID(), false).sales).toHaveLength(0);
  });
  it("rejects a sale at exact license expiration", () => {
    expect(() =>
      db.checkout(request, lease, "signed", lease.exp * 1000),
    ).toThrow(/expired/);
  });
  it("retains the last four GCash digits as text", () => {
    const sale = db.checkout(
      { ...request, method: "gcash", tendered: 25100, reference: "0042" },
      lease,
      "signed",
      Date.now(),
    );
    expect(sale.reference).toBe("0042");
  });
  it("does not accept duplicate lines as a stock bypass", () => {
    expect(() =>
      db.checkout(
        {
          ...request,
          items: [
            { productId: p.id, quantity: 6 },
            { productId: p.id, quantity: 6 },
          ],
        },
        lease,
        "signed",
        Date.now(),
      ),
    ).toThrow();
  });
  it("acknowledges only the specified tenant backup", () => {
    db.checkout(request, lease, "signed", Date.now());
    db.acknowledge(randomUUID(), [request.id]);
    expect(db.pending(lease.tenantId)).toHaveLength(1);
    db.acknowledge(lease.tenantId, [request.id]);
    expect(db.pending(lease.tenantId)).toHaveLength(0);
  });
  it("parses decimal money without floating point rounding", () => {
    expect(toCentavos("125.50")).toBe(12550);
    expect(toCentavos("0.01")).toBe(1);
    expect(() => toCentavos("1.999")).toThrow();
  });
});
