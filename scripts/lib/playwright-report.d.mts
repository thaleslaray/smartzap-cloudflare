export type PlaywrightReportSummary = {
  expected: number;
  skipped: number;
  unexpected: number;
  flaky: number;
  projects: string[];
};

export function summarizePlaywrightReport(
  report: unknown,
  expectedProject?: string,
): PlaywrightReportSummary;

export function assertPlaywrightReportClean(
  report: unknown,
  expectedProject?: string,
): PlaywrightReportSummary;
