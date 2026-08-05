import { expect, test, type Page } from "@playwright/test";
import {
  authenticatedOperationalRoutes,
  retiredAndFallbackRoutes,
} from "./support/route-inventory";

const remoteBaseUrl = process.env.QA_REMOTE_BASE_URL;

test.skip(
  !remoteBaseUrl || (!process.env.QA_READONLY_API_KEY && !process.env.QA_API_KEY),
  "Smoke remoto exige QA_REMOTE_BASE_URL e uma credencial técnica de leitura.",
);

const routes = [
  ...authenticatedOperationalRoutes,
  ...retiredAndFallbackRoutes,
];

async function assertHealthyLayout(page: Page, path: string, width: number) {
  const url = new URL(path, remoteBaseUrl);
  url.searchParams.set("__qa_shell", `${Date.now()}-${width}`);
  await page.goto(`${url.pathname}${url.search}`, { waitUntil: "domcontentloaded" });
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
  test.setTimeout(300_000);
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
