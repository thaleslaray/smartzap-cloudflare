function finiteCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Relatório Playwright inválido: stats.${label}`);
  }
  return value;
}

function collectProjects(value, projects = new Set()) {
  if (!value || typeof value !== "object") return projects;
  if (
    typeof value.projectName === "string" &&
    value.projectName.trim()
  ) {
    projects.add(value.projectName);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectProjects(item, projects);
    } else if (child && typeof child === "object") {
      collectProjects(child, projects);
    }
  }
  return projects;
}

export function summarizePlaywrightReport(report, expectedProject) {
  if (!report || typeof report !== "object" || !report.stats) {
    throw new Error("Relatório Playwright ausente ou inválido");
  }
  const summary = {
    expected: finiteCount(report.stats.expected, "expected"),
    skipped: finiteCount(report.stats.skipped, "skipped"),
    unexpected: finiteCount(report.stats.unexpected, "unexpected"),
    flaky: finiteCount(report.stats.flaky, "flaky"),
    projects: [...collectProjects(report)].sort(),
  };
  if (
    expectedProject &&
    !summary.projects.includes(expectedProject)
  ) {
    throw new Error(
      `Relatório Playwright não contém o projeto ${expectedProject}`,
    );
  }
  return summary;
}

export function assertPlaywrightReportClean(report, expectedProject) {
  const summary = summarizePlaywrightReport(report, expectedProject);
  if (summary.unexpected > 0) {
    throw new Error(
      `Playwright ${expectedProject || "sem projeto"} registrou ${summary.unexpected} resultado(s) inesperado(s)`,
    );
  }
  if (summary.flaky > 0) {
    throw new Error(
      `Playwright ${expectedProject || "sem projeto"} registrou ${summary.flaky} flake(s); retry não aprova o gate`,
    );
  }
  return summary;
}
