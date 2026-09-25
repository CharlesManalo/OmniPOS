import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
if (!files.length) throw new Error("No staged source files to review");
const forbidden =
  /(^|\/)(\.secrets|\.agents|\.aider-desk|node_modules|release|dist|test-results|\.temp)(\/|$)|(^|\/)\.env($|\.(?!example$|server\.example$))/;
const secretPatterns = [
  /sbp_[a-z0-9]{24,}/i,
  /sb_secret_[a-z0-9_-]{20,}/i,
  /(?:ghp|gho|ghs|github_pat)_[a-z0-9_]{20,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];
const privateValues = [];
try {
  const credentials = JSON.parse(
    await readFile(".secrets/developer-login.json", "utf8"),
  );
  if (credentials.password) privateValues.push(credentials.password);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
try {
  const env = await readFile(".secrets/supabase-secrets.env", "utf8");
  const line = env
    .split(/\r?\n/)
    .find((line) => line.startsWith("OMNIPOS_LICENSE_PRIVATE_KEY="));
  if (line) privateValues.push(line.slice(line.indexOf("=") + 1));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const file of files) {
  if (forbidden.test(file))
    throw new Error(`Refusing to publish private/generated file: ${file}`);
  const text = execFileSync("git", ["show", `:${file}`], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (
    secretPatterns.some((pattern) => pattern.test(text)) ||
    privateValues.some((value) => text.includes(value))
  )
    throw new Error(`Possible credential in staged source: ${file}`);
}
console.log(
  `${files.length} staged source files checked: no private paths or recognized credentials.`,
);
