import { expect, test, type Page } from "@playwright/test";

/**
 * Full user journey against a running stack (web + worker with AI_PROVIDER=fake + fixture site):
 * login -> new project -> pages -> analysis -> 3 designs -> build -> publish -> public site.
 * Requires FIXTURE_URL (site to redesign). SHOTS=<dir> saves screenshots of each step.
 */
const FIXTURE = process.env["FIXTURE_URL"] ?? "";
const SHOTS = process.env["SHOTS"];

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("redesign journey", async ({ page }) => {
  test.skip(!FIXTURE, "FIXTURE_URL not set");
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/sv/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(/\/sv\/dashboard/);
  await shot(page, "01-dashboard");

  await page.getByRole("link", { name: "Nytt projekt" }).click();
  await page.getByLabel("Nuvarande webbplats").fill(FIXTURE);
  await page.getByText("Engelska").click();
  await shot(page, "02-new-project");
  await page.getByRole("button", { name: "Starta" }).click();
  await expect(page).toHaveURL(/\/sv\/projects\/[0-9a-f-]+$/);

  // Step 1: pages appear as the crawl progresses.
  await expect(page.getByText("/om-oss/historia")).toBeVisible({ timeout: 90_000 });
  const analyse = page.getByRole("button", { name: "Analysera valda sidor" });
  await expect(analyse).toBeEnabled({ timeout: 90_000 });
  await shot(page, "03-pages");
  await analyse.click();

  // Step 2: analysis
  await expect(page.getByRole("heading", { name: "Analys", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Målgrupp")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Läs mer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "04-seo-dialog");
  await page.keyboard.press("Escape");
  await shot(page, "05-analysis");
  await page.getByRole("button", { name: "Godkänn och skapa design" }).click();

  // Step 3: three directions
  await expect(page.getByRole("heading", { name: "Design", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Välj", exact: true })).toHaveCount(3, { timeout: 180_000 });
  await shot(page, "06-design");
  await page.getByRole("button", { name: /Förhandsgranska live/ }).nth(1).click();
  const frame = page.frameLocator("dialog iframe");
  await expect(frame.locator("h1")).toContainText("Vi bygger hem som håller i generationer", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await shot(page, "07-direction-preview");
  await page.getByRole("dialog").getByRole("button", { name: "Välj", exact: true }).click();
  await page.getByRole("button", { name: "Godkänn och bygg webbplatsen" }).click();

  // Step 4: build, preview and publish
  await expect(page.getByRole("button", { name: "Publicera" })).toBeVisible({ timeout: 240_000 });
  await expect(page.frameLocator("main iframe").locator("h1")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shot(page, "08-site");
  await page.getByRole("button", { name: "Publicera" }).click();
  const link = page.getByRole("link", { name: /\/site\// });
  await expect(link).toBeVisible({ timeout: 60_000 });
  const url = await link.getAttribute("href");
  expect(url).toBeTruthy();

  // Public site: SEO head, runtime, all pages reachable.
  const res = await page.request.get(url!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-security-policy"]).toContain("script-src");
  const html = await res.text();
  expect(html).toContain('<link rel="canonical"');
  expect(html).toContain('hreflang="en"');
  expect(html).toContain("application/ld+json");
  const site = await page.context().newPage();
  const errors: string[] = [];
  site.on("pageerror", (e) => errors.push(e.message));
  await site.goto(url!);
  await expect(site.locator("html")).toHaveClass(/m-armed/);
  await shot(site, "09-published");
  await site.goto(`${url}/tjanster`);
  await expect(site.locator("h1")).toHaveText("Tjänster");
  await site.goto(`${url}/en`);
  await expect(site.locator("html")).toHaveAttribute("lang", "en");
  expect((await page.request.get(`${url}/sitemap.xml`)).status()).toBe(200);
  expect(errors).toEqual([]);
});
