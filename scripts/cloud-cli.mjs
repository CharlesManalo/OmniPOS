import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const projectRef = "yhovrmjbtwwnzmsrdnja";
export const projectUrl = `https://${projectRef}.supabase.co`;
const execute = promisify(execFile);
// Capture CLI output in memory: API keys must never reach the terminal/logs.
export async function cli(args) {
  let stdout;
  try {
    ({ stdout } = await execute(
      process.execPath,
      [
        "node_modules/supabase/dist/supabase.js",
        ...args,
        "--output-format",
        "json",
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    ));
  } catch {
    throw new Error(
      `Supabase CLI ${args.slice(0, 2).join(" ")} failed. Check login and project access.`,
    );
  }
  return JSON.parse(stdout);
}
export async function projectKeys() {
  const result = await cli([
    "projects",
    "api-keys",
    "--project-ref",
    projectRef,
  ]);
  const publicKey = result.keys.find((k) => k.type === "publishable")?.api_key;
  const serviceKey = result.keys.find(
    (k) => k.name === "service_role",
  )?.api_key;
  if (!publicKey || !serviceKey)
    throw new Error("Project API keys unavailable");
  return { publicKey, serviceKey };
}
