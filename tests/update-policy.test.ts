import { describe, it, expect } from "vitest";
import {
  compareVersions,
  updateDecision,
} from "../packages/domain/update-policy";
const release = (
  mode: "optional" | "required",
  minimumVersion: string,
  version = "1.2.0",
) => ({ version, omniposPolicy: { schemaVersion: 1, mode, minimumVersion } });
describe("release policy", () => {
  it("compares stable versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("0.1.1", "0.1.1")).toBe(0);
  });
  it("keeps optional updates optional", () => {
    expect(updateDecision("1.0.0", release("optional", "0.0.0")).required).toBe(
      false,
    );
  });
  it("requires a mandatory release only on older versions", () => {
    expect(updateDecision("1.0.0", release("required", "1.2.0")).required).toBe(
      true,
    );
    expect(updateDecision("1.2.0", release("required", "1.2.0")).required).toBe(
      false,
    );
  });
  it("carries a prior required floor through a later optional release", () => {
    expect(updateDecision("1.0.0", release("optional", "1.1.0")).required).toBe(
      true,
    );
    expect(updateDecision("1.1.0", release("optional", "1.1.0")).required).toBe(
      false,
    );
  });
  it("rejects missing and inconsistent release metadata", () => {
    expect(() => updateDecision("1.0.0", { version: "1.2.0" })).toThrow();
    expect(() =>
      updateDecision("1.0.0", release("required", "1.1.0")),
    ).toThrow();
    expect(() =>
      updateDecision("1.0.0", release("optional", "2.0.0")),
    ).toThrow();
    expect(() => compareVersions("1.0.0-beta", "1.0.0")).toThrow();
  });
});
