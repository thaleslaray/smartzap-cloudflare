export const SOAK_REQUIRED_CHECKS = Object.freeze([
  "fourteenDaysElapsed",
  "cyclesConsolidated",
  "gapsExplained",
  "latencyReviewed",
  "queuesReviewed",
  "duplicatesReviewed",
  "zeroKnownP0P1",
]);

const MAX_EXPECTED_GAP_MS = 10 * 60 * 1000;
const BOUNDARY_TOLERANCE_MS = 10 * 60 * 1000;
const MAX_P95_LATENCY_MS = 2_000;
const MAX_SINGLE_LATENCY_MS = 15_000;

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function validExplanation(item) {
  return String(item?.reason || "").trim().length >= 10
    && String(item?.evidence || "").trim().length >= 3;
}

function failureExplained(report, exceptions) {
  return (exceptions.acceptedFailures || []).some((item) =>
    item.scheduledTime === report.scheduledTime
      && timestamp(item.fixedAt) !== null
      && validExplanation(item));
}

function gapExplained(gap, exceptions) {
  return (exceptions.explainedGaps || []).some((item) => {
    const from = timestamp(item.from);
    const to = timestamp(item.to);
    return from !== null && to !== null && from <= gap.fromMs && to >= gap.toMs
      && validExplanation(item);
  });
}

export function consolidateSoak({
  reports,
  release,
  startAt,
  endAt,
  observedAt = new Date().toISOString(),
  exceptions = {},
  operations = {},
}) {
  const issues = [];
  const startMs = timestamp(startAt);
  const endMs = timestamp(endAt);
  const nowMs = timestamp(observedAt);
  if (startMs === null || endMs === null || endMs <= startMs) throw new Error("Janela do soak inválida.");
  if (nowMs === null) throw new Error("Data de observação inválida.");

  const normalized = [];
  for (const report of reports || []) {
    const scheduledMs = timestamp(report?.scheduledTime);
    if (report?.schemaVersion !== 1 || scheduledMs === null || !Array.isArray(report?.checks)) {
      issues.push("relatório de monitor inválido");
      continue;
    }
    if (scheduledMs < startMs || scheduledMs > endMs) continue;
    normalized.push({ ...report, scheduledMs });
  }
  normalized.sort((a, b) => a.scheduledMs - b.scheduledMs);
  const seen = new Set();
  const duplicates = [];
  for (const report of normalized) {
    if (seen.has(report.scheduledTime)) duplicates.push(report.scheduledTime);
    seen.add(report.scheduledTime);
  }

  const failed = normalized.filter((report) => report.status !== "passed"
    || report.checks.some((check) => check.status !== "passed"));
  const unexplainedFailures = failed.filter((report) => !failureExplained(report, exceptions));
  const gaps = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const from = normalized[index - 1].scheduledMs;
    const to = normalized[index].scheduledMs;
    if (to - from > MAX_EXPECTED_GAP_MS) {
      gaps.push({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        fromMs: from,
        toMs: to,
        durationMs: to - from,
      });
    }
  }
  const unexplainedGaps = gaps.filter((gap) => !gapExplained(gap, exceptions));
  const latencies = normalized.flatMap((report) => report.checks)
    .map((check) => Number(check.latencyMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const retries = normalized.flatMap((report) => report.checks)
    .filter((check) => Number(check.attempts) > 1).length;
  const p95LatencyMs = percentile(latencies, 0.95);
  const maxLatencyMs = latencies.length ? Math.max(...latencies) : null;

  const elapsed = nowMs >= endMs;
  const firstCovered = normalized.length > 0
    && normalized[0].scheduledMs <= startMs + BOUNDARY_TOLERANCE_MS;
  const lastCovered = !elapsed || (normalized.length > 0
    && normalized.at(-1).scheduledMs >= endMs - BOUNDARY_TOLERANCE_MS);
  const queues = operations.queues || {};
  const queueSnapshots = [queues.staging, queues.production];
  const queuesPassed = queueSnapshots.every((snapshot) => snapshot?.status === "passed"
    && Number(snapshot.backlog) === 0);
  const integrity = operations.integrity || {};
  const duplicatesPassed = [
    integrity.eventKeyDuplicates,
    integrity.sendRequestDuplicates,
    integrity.stalledCampaigns,
    integrity.stalledSends,
  ].every((value) => Number(value) === 0);

  const checks = {
    fourteenDaysElapsed: elapsed,
    cyclesConsolidated: normalized.length > 0 && duplicates.length === 0 && firstCovered
      && lastCovered && unexplainedFailures.length === 0,
    gapsExplained: unexplainedGaps.length === 0,
    latencyReviewed: latencies.length > 0 && p95LatencyMs <= MAX_P95_LATENCY_MS
      && maxLatencyMs <= MAX_SINGLE_LATENCY_MS,
    queuesReviewed: queuesPassed,
    duplicatesReviewed: duplicatesPassed,
    zeroKnownP0P1: unexplainedFailures.length === 0 && queuesPassed && duplicatesPassed,
  };

  if (!elapsed) issues.push(`janela de 14 dias termina em ${new Date(endMs).toISOString()}`);
  if (!firstCovered) issues.push("início da janela não está coberto pelo monitor");
  if (!lastCovered) issues.push("fim da janela não está coberto pelo monitor");
  if (duplicates.length) issues.push(`${duplicates.length} ciclo(s) duplicado(s)`);
  if (unexplainedFailures.length) issues.push(`${unexplainedFailures.length} falha(s) sem explicação aceita`);
  if (unexplainedGaps.length) issues.push(`${unexplainedGaps.length} lacuna(s) sem explicação aceita`);
  if (!checks.latencyReviewed) issues.push("latência ausente ou acima do limite conservador");
  if (!queuesPassed) issues.push("filas de staging/produção não foram comprovadas vazias");
  if (!duplicatesPassed) issues.push("integridade operacional encontrou duplicação ou item travado");
  const status = Object.values(checks).every(Boolean) && issues.length === 0 ? "passed" : "failed";
  return {
    schemaVersion: 1,
    kind: "smartzap-soak-consolidation",
    status,
    release,
    observedAt: new Date(nowMs).toISOString(),
    window: { startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString() },
    metrics: {
      cycles: normalized.length,
      passedCycles: normalized.length - failed.length,
      failedCycles: failed.length,
      explainedFailures: failed.length - unexplainedFailures.length,
      gaps: gaps.map(({ fromMs: _from, toMs: _to, ...gap }) => gap),
      unexplainedGaps: unexplainedGaps.length,
      latencySamples: latencies.length,
      p95LatencyMs,
      maxLatencyMs,
      retries,
    },
    operations,
    checks,
    issues,
  };
}
