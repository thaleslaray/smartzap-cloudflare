import { expect, test, type Page } from "@playwright/test";

const remoteBaseUrl = process.env.QA_REMOTE_BASE_URL;

test.skip(
  !remoteBaseUrl || !process.env.QA_API_KEY,
  "Smoke remoto exige QA_REMOTE_BASE_URL e QA_API_KEY.",
);

const routes = [
  "/",
  "/campaigns",
  "/contacts",
  "/inbox",
  "/templates",
  "/settings",
  "/settings/performance",
  "/settings/ai",
  "/settings/ai/agents",
];

async function assertHealthyLayout(page: Page, path: string, width: number) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(/Algo deu errado|A tela encontrou um erro/i),
  ).toHaveCount(0);
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(
    layout.documentWidth,
    `${path} não pode criar rolagem horizontal em ${width}px`,
  ).toBeLessThanOrEqual(layout.viewportWidth);
}

test("Cloudflare remoto responde, autentica e renderiza rotas críticas sem mutação", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true });

  const auth = await request.get("/api/auth/status");
  expect(auth.ok()).toBe(true);
  expect(await auth.json()).toMatchObject({ authenticated: true });

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of routes) await assertHealthyLayout(page, path, width);
  }
});
