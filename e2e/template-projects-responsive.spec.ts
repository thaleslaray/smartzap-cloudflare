import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "620x900", width: 620, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const item = {
  id: "responsive-item",
  name: "template_responsivo",
  content: "Olá {{1}}, confirmação disponível.",
  language: "pt_BR",
  category: "UTILITY",
  status: "draft",
  meta_id: null,
  meta_status: null,
  rejected_reason: null,
  variables: { "1": "Ana" },
  sample_variables: { "1": "Ana" },
  buttons: [],
};
const project = {
  id: "responsive-project",
  title: "Projeto responsivo com um título longo para validar quebra e alinhamento",
  strategy: "utility",
  status: "draft",
  source: "manual",
  template_count: 1,
  approved_count: 0,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  items: [item],
};
async function login(page: Page) {
  await page.goto("/login");
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Senha mestra").fill("dev");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}
async function assertLayout(page: Page, runAxe: boolean) {
  const result = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0) return false;
        if (element.closest('[class*="overflow-x-auto"],[class*="overflow-x-scroll"]')) return false;
        return rect.left < -2 || rect.right > window.innerWidth + 2;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName}.${String(element.className).split(" ").slice(0, 2).join(".")}`),
  }));
  expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth);
  expect(result.offenders).toEqual([]);
  if (runAxe) {
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(scan.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""))).toEqual([]);
  }
}

for (const viewport of viewports) {
  test(`lista responsiva ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.route("**/api/template-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [project] }) }));
    await page.goto("/templates?tab=projects");
    const projectTitle = viewport.width < 1024
      ? page.locator("p").filter({ hasText: project.title })
      : page.locator("span").filter({ hasText: project.title });
    await expect(projectTitle.first()).toBeVisible();
    await assertLayout(page, viewport.width === 390 || viewport.width === 1440);
  });

  test(`criação responsiva ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.goto("/templates/projects/new");
    await expect(page.getByLabel("Conteúdo fonte")).toBeVisible();
    await assertLayout(page, viewport.width === 390 || viewport.width === 1440);
  });

  test(`detalhe responsivo ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await page.route("**/api/template-projects/responsive-project", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(project) }));
    await page.goto("/templates/projects/responsive-project");
    await expect(page.getByRole("heading", { name: project.title })).toBeVisible();
    await assertLayout(page, viewport.width === 390 || viewport.width === 1440);
  });
}
