import { importSPKI, jwtVerify } from "jose";
import { License, type Lease } from "./contracts";

export async function verifyLicense(
  token: string,
  publicKey: string,
  binding: { deviceId: string; userId: string },
  now: number,
): Promise<Lease> {
  const key = await importSPKI(publicKey, "EdDSA");
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["EdDSA"],
    issuer: "omnipos",
    audience: "omnipos-pos",
    currentDate: new Date(now),
    clockTolerance: 0,
  });
  const lease = License.parse(payload);
  if (lease.deviceId !== binding.deviceId || lease.userId !== binding.userId)
    throw new Error("License belongs to another account or terminal");
  if (lease.iat * 1000 > now + 30_000)
    throw new Error("System clock is behind the license server");
  return lease;
}

export class LicenseClock {
  private startWall: number;
  private startMono: number;
  private highWater: number;
  constructor(
    saved: number,
    private wall = () => Date.now(),
    private mono = () => performance.now(),
  ) {
    this.startWall = wall();
    this.startMono = mono();
    this.highWater = Math.max(saved, this.startWall);
  }
  now() {
    const wall = this.wall();
    if (wall + 30_000 < this.highWater)
      throw new Error(
        "Clock moved backwards. Correct the system clock and reconnect.",
      );
    this.highWater = Math.max(
      this.highWater,
      wall,
      this.startWall + this.mono() - this.startMono,
    );
    return this.highWater;
  }
  watermark() {
    return this.highWater;
  }
}
