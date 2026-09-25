import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { LicenseClock, verifyLicense } from "../packages/domain/license";
import { can, Checkout } from "../packages/domain/contracts";
const userId = randomUUID(),
  deviceId = randomUUID(),
  tenantId = randomUUID();
const now = Date.now(),
  seconds = Math.floor(now / 1000);
let keys: Awaited<ReturnType<typeof generateKeyPair>>, pub: string;
beforeAll(async () => {
  keys = await generateKeyPair("EdDSA", { extractable: true });
  pub = await exportSPKI(keys.publicKey);
});
async function sign(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    tenantId,
    userId,
    deviceId,
    tenantName: "Test",
    role: "owner",
    modules: ["pos"],
    version: 1,
    paidUntil: seconds + 86400,
    iat: seconds,
    exp: seconds + 3600,
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer("omnipos")
    .setAudience("omnipos-pos")
    .sign(keys.privateKey);
}
describe("signed license enforcement", () => {
  it("accepts a correctly signed lease bound to this user and terminal", async () => {
    expect(
      (await verifyLicense(await sign(), pub, { userId, deviceId }, now))
        .tenantId,
    ).toBe(tenantId);
  });
  it("rejects an expired paid period", async () => {
    await expect(
      verifyLicense(
        await sign({ paidUntil: seconds - 1, exp: seconds - 1 }),
        pub,
        { userId, deviceId },
        now,
      ),
    ).rejects.toThrow();
  });
  it("rejects a lease extending beyond paid access", async () => {
    await expect(
      verifyLicense(
        await sign({ paidUntil: seconds + 10, exp: seconds + 50 }),
        pub,
        { userId, deviceId },
        now,
      ),
    ).rejects.toThrow();
  });
  it("never permits more than 24 hours offline", async () => {
    await expect(
      verifyLicense(
        await sign({ exp: seconds + 86401, paidUntil: seconds + 99999 }),
        pub,
        { userId, deviceId },
        now,
      ),
    ).rejects.toThrow();
  });
  it("rejects a copied device license", async () => {
    await expect(
      verifyLicense(await sign(), pub, { userId, deviceId: randomUUID() }, now),
    ).rejects.toThrow(/terminal/);
  });
  it("rejects a different signed-in user", async () => {
    await expect(
      verifyLicense(await sign(), pub, { userId: randomUUID(), deviceId }, now),
    ).rejects.toThrow();
  });
  it("rejects forged signatures", async () => {
    const fake = await generateKeyPair("EdDSA");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA" })
      .sign(fake.privateKey);
    await expect(
      verifyLicense(token, pub, { userId, deviceId }, now),
    ).rejects.toThrow();
  });
  it("blocks ordinary clock rollback across restarts", () => {
    expect(() =>
      new LicenseClock(
        100000,
        () => 60000,
        () => 0,
      ).now(),
    ).toThrow(/backwards/);
  });
  it("continues advancing with a monotonic clock if wall time freezes", () => {
    let elapsed = 0;
    const clock = new LicenseClock(
      0,
      () => 100000,
      () => elapsed,
    );
    elapsed = 20000;
    expect(clock.now()).toBe(120000);
  });
  it("does not grant cashier inventory or report permissions", () => {
    expect(can("cashier", "inventory")).toBe(false);
    expect(can("cashier", "reports")).toBe(false);
    expect(can("cashier", "checkout")).toBe(true);
    expect(can("auditor", "checkout")).toBe(false);
  });
  it("preserves GCash leading zeroes and rejects incomplete references", () => {
    const sale = {
      id: randomUUID(),
      items: [{ productId: randomUUID(), quantity: 1 }],
      method: "gcash",
      tendered: 100,
      reference: "0042",
    };
    expect(Checkout.parse(sale).reference).toBe("0042");
    expect(Checkout.safeParse({ ...sale, reference: "42" }).success).toBe(
      false,
    );
  });
});
