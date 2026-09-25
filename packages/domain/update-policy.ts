import { z } from "zod";

export const StableVersion = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .max(32);
export const ReleasePolicy = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(["optional", "required"]),
    minimumVersion: StableVersion,
  })
  .strict();
export function compareVersions(a: string, b: string) {
  const left = StableVersion.parse(a).split(".").map(Number);
  const right = StableVersion.parse(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (!Number.isSafeInteger(left[i]) || !Number.isSafeInteger(right[i]))
      throw new Error("Invalid version");
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
export const ReleaseMetadata = z
  .object({
    version: StableVersion,
    omniposPolicy: ReleasePolicy,
    releaseNotes: z.string().max(20_000).optional(),
  })
  .refine(
    (v) => compareVersions(v.omniposPolicy.minimumVersion, v.version) <= 0,
    "Minimum supported version cannot exceed the release version",
  )
  .refine(
    (v) =>
      v.omniposPolicy.mode !== "required" ||
      v.omniposPolicy.minimumVersion === v.version,
    "Required release must require its own version",
  );
export function updateDecision(currentVersion: string, raw: unknown) {
  const metadata = ReleaseMetadata.parse(raw);
  return {
    ...metadata,
    required:
      compareVersions(currentVersion, metadata.omniposPolicy.minimumVersion) <
      0,
  };
}
