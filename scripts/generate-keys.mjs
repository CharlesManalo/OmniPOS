import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const dir = ".secrets";
mkdirSync(dir, { recursive: true });
if (existsSync(`${dir}/license-private.pem`))
  throw new Error(
    "Keys already exist. Preserve the existing signing identity.",
  );
const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const secret = Buffer.from(privateKey).toString("base64"),
  pub = Buffer.from(publicKey).toString("base64");
writeFileSync(`${dir}/license-private.pem`, privateKey, {
  flag: "wx",
  mode: 0o600,
});
writeFileSync(`${dir}/license-public.pem`, publicKey, { flag: "wx" });
writeFileSync(
  `${dir}/supabase-secrets.env`,
  `OMNIPOS_LICENSE_PRIVATE_KEY=${secret}\nOMNIPOS_LICENSE_PUBLIC_KEY=${pub}\n`,
  { flag: "wx", mode: 0o600 },
);
writeFileSync(
  `${dir}/desktop-public.env`,
  `OMNIPOS_LICENSE_PUBLIC_KEY=${pub}\n`,
  { flag: "wx" },
);
console.log(
  "Signing keys generated in ignored .secrets/. Keep the private key on the server. Public build setting is in desktop-public.env.",
);
