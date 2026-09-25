import { spawn } from "node:child_process";
export const repository = "CharlesManalo/OmniPOS";
let token;
async function credential() {
  if (token) return token;
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)
    return (token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  const result = await new Promise((resolve, reject) => {
    const child = spawn("git", ["credential", "fill"], {
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.resume();
    child.on("error", () =>
      reject(new Error("Git credential helper unavailable")),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error("Sign in to GitHub with Git Credential Manager first"),
          ),
    );
    child.stdin.end("protocol=https\nhost=github.com\n\n");
  });
  token = result
    .split(/\r?\n/)
    .find((line) => line.startsWith("password="))
    ?.slice(9);
  if (!token) throw new Error("GitHub credential unavailable");
  return token;
}
export async function github(
  path,
  { method = "GET", body, raw, contentType } = {},
) {
  const url = new URL(path, "https://api.github.com");
  if (
    !["api.github.com", "uploads.github.com"].includes(url.hostname) ||
    url.protocol !== "https:"
  )
    throw new Error(
      "Refusing to send a GitHub credential to an untrusted host",
    );
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await credential()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": contentType ?? "application/json",
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(raw ? 300_000 : 30_000),
    redirect: "error",
  });
  if (!response.ok)
    throw Object.assign(
      new Error(
        `GitHub ${method} ${url.pathname} returned HTTP ${response.status}`,
      ),
      { status: response.status },
    );
  return response.status === 204 ? null : response.json();
}
if (process.argv.includes("--verify")) {
  const user = await github("/user");
  const repo = await github(`/repos/${repository}`);
  console.log(
    JSON.stringify({
      login: user.login,
      repository: repo.full_name,
      canPush: repo.permissions?.push,
      visibility: repo.visibility,
    }),
  );
}
