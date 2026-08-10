import { describe, expect, it } from "vitest";
import {
  assertPlaywrightReportClean,
  summarizePlaywrightReport,
} from "../scripts/lib/playwright-report.mjs";

function report(stats: {
  expected?: number;
  skipped?: number;
  unexpected?: number;
  flaky?: number;
}) {
  return {
    stats: {
      expected: stats.expected ?? 54,
      skipped: stats.skipped ?? 1,
      unexpected: stats.unexpected ?? 0,
      flaky: stats.flaky ?? 0,
    },
    suites: [
      {
        specs: [
          {
            tests: [
              {
                projectName: "webkit",
                status: "expected",
                results: [{ status: "passed", retry: 0 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("política do relatório Playwright", () => {
  it("aprova somente resultado limpo do projeto esperado", () => {
    expect(assertPlaywrightReportClean(report({}), "webkit")).toMatchObject({
      expected: 54,
      skipped: 1,
      unexpected: 0,
      flaky: 0,
      projects: ["webkit"],
    });
  });

  it("reprova flake mesmo quando o retry passou", () => {
    expect(() =>
      assertPlaywrightReportClean(report({ flaky: 1 }), "webkit"),
    ).toThrow(/retry não aprova o gate/);
  });

  it("reprova relatório de outro projeto ou estatística inválida", () => {
    expect(() =>
      summarizePlaywrightReport(report({}), "firefox"),
    ).toThrow(/não contém o projeto firefox/);
    expect(() =>
      summarizePlaywrightReport(
        {
          ...report({}),
          stats: { ...report({}).stats, flaky: -1 },
        },
        "webkit",
      ),
    ).toThrow(/stats\.flaky/);
  });
});
