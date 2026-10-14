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
  if (process.env["E2E_AUTH"] === "password") {
    // Own accounts: create one, log out, log back in with the password.
    await page.getByRole("button", { name: "Inget konto? Skapa ett" }).click();
    await page.getByLabel("Lösenord").fill("e2e-lösenord-123");
    await page.getByRole("button", { name: "Skapa konto" }).click();
    await expect(page).toHaveURL(/\/sv\/dashboard/);
    await page.context().clearCookies();
    await page.goto("/sv/login");
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Lösenord").fill("fel-lösenord-123");
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page.getByText("Fel e-post eller lösenord.")).toBeVisible();
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Lösenord").fill("e2e-lösenord-123");
  }
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
  // Each page shows how much content was read, so gaps are visible before anything is paid for.
  await expect(page.getByText(/\d+ sektioner · \d+ ord/).first()).toBeVisible({ timeout: 90_000 });
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
  // The direction opens in its own tab, and the menu keeps the visitor inside the preview.
  const [dirTab] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("dialog").getByRole("link", { name: "Öppna i ny flik" }).click()]);
  await expect(dirTab.locator("h1")).toContainText("Vi bygger hem som håller i generationer");
  await expect(dirTab.locator("html")).toHaveClass(/m-armed/);
  const navHref = await dirTab.locator("header a[href*='/preview/direction/']").first().getAttribute("href");
  expect(navHref).toMatch(/^\/preview\/direction\//);
  await dirTab.close();
  await page.getByRole("dialog").getByRole("button", { name: "Välj", exact: true }).click();
  await page.getByRole("button", { name: "Godkänn och bygg webbplatsen" }).click();

  // Step 4: build, preview and publish
  await expect(page.getByRole("button", { name: "Publicera" })).toBeVisible({ timeout: 240_000 });
  await expect(page.frameLocator("main iframe").locator("h1")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shot(page, "08-site");

  // Test link: works in a fresh browser without logging in, across pages, with the motion runtime.
  await page.getByRole("button", { name: "Kopiera testlänk" }).click();
  const testLink = await page.getByTestId("test-link").getAttribute("href");
  // Menu = the built pages, including /om-oss/historia which the original menu did not list.
  await expect(page.frameLocator("main iframe").locator("header nav").first()).toContainText("Historia");
  expect(testLink).toMatch(/\/p\/[A-Za-z0-9_-]{16,}$/);
  const guest = await (await page.context().browser()!.newContext()).newPage();
  await guest.goto(testLink!);
  await expect(guest.locator("h1")).toContainText("Vi bygger hem som håller i generationer");
  await expect(guest.locator("html")).toHaveClass(/m-armed/);
  await guest.goto(`${testLink}/tjanster`);
  await expect(guest.locator("h1")).toHaveText("Tjänster");
  const missing = await guest.request.get(`${testLink}/finns-inte`);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("<h1");
  expect((await guest.request.get(testLink!.replace(/\/p\/[^/]+$/, "/p/okandtokenokandtoken1"))).status()).toBe(404);
  await guest.context().close();
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
