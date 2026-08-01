import { expect, test, type Page } from "@playwright/test";
import { gotoAuthedRoute, waitForAuthedAppReady } from "./support/navigation";

const routes = [
  "/",
  "/campaigns",
  "/campaigns/new",
  "/contacts",
  "/segments",
  "/inbox",
  "/knowledge",
  "/templates",
  "/templates/drafts/new",
  "/templates/new",
  "/submissions",
  "/flows/builder",
  "/forms",
  "/settings",
  "/settings/attendants",
  "/settings/meta-diagnostics",
  "/settings/performance",
  "/settings/ai",
  "/settings/ai/agents",
];

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 620, height: 900 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha mestra").fill("dev");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await waitForAuthedAppReady(page);
}

for (const viewport of viewports) {
  test(`matriz visual ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await login(page);
    for (const route of routes) {
      await gotoAuthedRoute(page, route);
      await expect(page).not.toHaveURL(/\/login$/);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const offenders = [...document.querySelectorAll("body *")]
          .filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              rect.width <= 0 ||
              rect.height <= 0
            )
              return false;
            if (
              element.closest(
                '[class*="overflow-x-auto"],[class*="overflow-x-scroll"],[data-allow-horizontal-scroll="true"]',
              )
            )
              return false;
            return rect.left < -3 || rect.right > window.innerWidth + 3;
          })
          .slice(0, 10)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return `${element.tagName}.${String(element.className)
              .split(" ")
              .slice(0, 2)
              .join(".")}(${Math.round(rect.left)}..${Math.round(rect.right)})`;
          });
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          offenders,
        };
      });
      expect(
        layout.offenders,
        `${route} em ${viewport.width}px possui overflow: ${layout.offenders.join(", ")}`,
      ).toEqual([]);
      await testInfo.attach(
        `${viewport.width}x${viewport.height}-${route
          .replaceAll("/", "-")
          .replace(/^-+/, "") || "dashboard"}`,
        {
          body: await page.screenshot({
            fullPage: true,
            animations: "disabled",
          }),
          contentType: "image/png",
        },
      );
    }
    expect(consoleErrors, "console.error detectado na matriz visual").toEqual(
      [],
    );
  });
}
