import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const developer = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  developer.on("pageerror", (e) => errors.push(e.message));
  await developer.goto("http://127.0.0.1:5174");
  await expect(
    developer.getByRole("heading", { name: "Your businesses, at a glance." }),
  ).toBeVisible();
  await developer.screenshot({
    path: "test-results/developer-overview.png",
    fullPage: true,
  });
  await developer
    .getByRole("button", { name: "New client", exact: true })
    .click();
  await developer.getByLabel("Business name").fill("Test Store");
  await developer.getByLabel("Contact email").fill("store@example.com");
  await developer.getByLabel("Sign-in email").fill("owner@example.com");
  await developer.getByLabel("Initial password").fill("Test-Password-2026");
  await developer
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(
    developer.getByRole("button", { name: /Test Store/ }).first(),
  ).toBeVisible();
  await developer.getByRole("button", { name: "Clients & tenants" }).click();
  await developer
    .getByRole("button", { name: "Disable Test Store", exact: true })
    .click();
  await expect(
    developer.getByRole("row").filter({ hasText: "Test Store" }),
  ).toContainText("disabled");
  await developer
    .getByRole("button", { name: "Enable Test Store", exact: true })
    .click();
  await expect(
    developer.getByRole("row").filter({ hasText: "Test Store" }),
  ).toContainText("active");
  await developer
    .getByRole("button", { name: "Delete Test Store", exact: true })
    .click();
  await developer.getByRole("textbox").last().fill("Test Store");
  await developer
    .getByRole("button", { name: "Delete client", exact: true })
    .click();
  await developer.getByLabel("Filter client status").selectOption("deleted");
  await expect(
    developer.getByRole("row").filter({ hasText: "Test Store" }),
  ).toContainText("deleted");
  const pos = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  pos.on("pageerror", (e) => errors.push(e.message));
  await pos.goto("http://127.0.0.1:5173");
  await expect(
    pos.getByRole("heading", { name: "Let’s make a good sale." }),
  ).toBeVisible();
  await pos.screenshot({
    path: "test-results/pos-counter.png",
    fullPage: true,
  });
  await pos.getByRole("button", { name: /House blend coffee/ }).click();
  await pos.getByRole("button", { name: /Charge/ }).click();
  await pos.getByRole("button", { name: "GCash", exact: true }).click();
  await pos.getByLabel("GCash reference · last 4 digits").fill("0042");
  await pos.getByRole("checkbox").check();
  await pos.getByRole("button", { name: "Confirm payment" }).click();
  await expect(
    pos.getByRole("heading", { name: "Sale complete" }),
  ).toBeVisible();
  await expect(pos.getByRole("dialog")).toContainText("0042");
  await pos.screenshot({
    path: "test-results/pos-payment.png",
    fullPage: true,
  });
  await pos.getByRole("button", { name: "Back to counter" }).click();
  await pos.setViewportSize({ width: 1024, height: 768 });
  await pos.screenshot({
    path: "test-results/pos-small-screen.png",
    fullPage: true,
  });
  await pos.getByRole("button", { name: /What’s new/ }).click();
  await expect(pos.getByRole("dialog")).toContainText(
    "Client updates and release controls",
  );
  await expect(pos.getByRole("dialog")).toContainText(
    "Required updates prevent new sales",
  );
  await pos.screenshot({
    path: "test-results/pos-patch-notes.png",
    fullPage: true,
  });
  const overflow = await pos.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow)
    throw new Error("POS overflows the supported small desktop width");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "UI preview: tenant creation/disable/enable/delete, GCash reference, receipt, and 1024px layout PASS.",
  );
} finally {
  await browser.close();
}
