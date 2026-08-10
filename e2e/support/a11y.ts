import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  label: string,
) {
  const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
  const relevant = violations.filter((violation) => {
    const webkitNativeSelectFalsePositive =
      testInfo.project.name === "webkit" &&
      violation.id === "color-contrast" &&
      violation.nodes.every((node) =>
        node.target.every((target) => String(target).includes("select")),
      );
    return !webkitNativeSelectFalsePositive;
  });
  expect(relevant, `${label}: violações WCAG A/AA`).toEqual([]);
}
