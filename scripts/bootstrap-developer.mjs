import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { projectKeys, projectUrl } from "./cloud-cli.mjs";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Usage: node scripts/bootstrap-developer.mjs <your-email>");
const { serviceKey } = await projectKeys();
const admin = createClient(projectUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let user;
for (let page = 1; ; page++) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (result.error) throw new Error("Could not check existing auth users");
  user = result.data.users.find((u) => u.email?.toLowerCase() === email);
  if (user || result.data.users.length < 100) break;
}
if (!user) {
  await mkdir(".secrets", { recursive: true });
  const file = ".secrets/developer-login.json";
  let credentials;
  try {
    credentials = JSON.parse(await readFile(file, "utf8"));
    if (credentials.email !== email)
      throw new Error(
        "Existing bootstrap credentials belong to a different email",
      );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    credentials = {
      email,
      password: `Omni!${randomBytes(24).toString("base64url")}`,
    };
    await writeFile(file, JSON.stringify(credentials, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  const result = await admin.auth.admin.createUser({
    ...credentials,
    email_confirm: true,
  });
  if (result.error || !result.data.user)
    throw new Error(
      "Developer account creation failed; no existing password was changed",
    );
  user = result.data.user;
  console.log(
    "New developer login created. Initial credentials are in ignored .secrets/developer-login.json. Change the password after signing in.",
  );
} else {
  console.log("Using the existing Auth account without changing its password.");
}
const { error } = await admin
  .from("omni_developers")
  .upsert({ user_id: user.id, enabled: true });
if (error)
  throw new Error(
    "Could not grant developer access; check that the schema is deployed",
  );
const verify = await admin
  .from("omni_developers")
  .select("enabled")
  .eq("user_id", user.id)
  .single();
if (verify.error || !verify.data?.enabled)
  throw new Error("Developer access readback failed");
console.log("Developer allowlist grant verified.");
