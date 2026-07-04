import {
  createResearchTask,
  getReport,
  getReportSources,
  getResearchReport,
  getResearchTask,
  getResearchTaskEvents,
  listReports,
  reindexKnowledgeReport,
  searchKnowledge,
  searchSources
} from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_RESEARCH_RAG_TIMEOUT_MS ?? 240000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 1000);

async function main() {
  await assertOk(`${apiBase}/health`, "health");
  await waitForQueueIdle();

  const marker = `RESEARCH_RAG_SMOKE_${Date.now()}`;
  const created = await createResearchTask(apiBase, {
    input: marker,
    inputType: "symbol",
    question: `Research-to-RAG acceptance smoke for ${marker}`,
    options: {
      includeOnchain: false,
      includeSocial: false,
      includeSimilarCases: false
    }
  });
  assert(created.task?.id, "expected created research task id");

  const task = await waitForTask(created.task.id);
  assert(task.status === "completed", `expected research task completed, got ${task.status}`);

  const report = await getResearchReport(apiBase, created.task.id);
  assert(report.id, "expected generated report id");
  assert(report.taskId === created.task.id, `expected report taskId ${created.task.id}, got ${report.taskId}`);
  assert(typeof report.markdown === "string" && report.markdown.includes(marker), "expected report markdown to preserve input marker");

  const indexedEvent = await waitForEvent(created.task.id, "knowledge_indexed");
  assert(indexedEvent.payload?.indexed === true || typeof indexedEvent.payload?.degradedReason === "string", "expected knowledge indexing to complete or degrade explicitly");

  const storedReport = await getReport(apiBase, report.id);
  assert(storedReport.id === report.id, "expected generated report to be retrievable from knowledge reports");
  assert(storedReport.markdown.includes(marker), "expected knowledge report markdown to preserve input marker");

  const reportList = await listReports(apiBase);
  assert(
    Array.isArray(reportList.reports) && reportList.reports.some((item) => item.id === report.id),
    "expected generated report to appear in knowledge report list"
  );

  const search = await searchKnowledge(apiBase, marker);
  assert(Array.isArray(search.reports), "expected knowledge search reports array");
  assert(
    search.reports.some((item) => item.id === report.id),
    `expected knowledge SQL search to return generated report ${report.id}`
  );
  assert(Array.isArray(search.vectorHits), "expected knowledge search vectorHits array");
  assert(
    search.vectorHits.some((item) => item.reportId === report.id) || typeof search.degradedReason === "string",
    "expected vector search to return the generated report or degrade explicitly"
  );

  const reindex = await reindexKnowledgeReport(apiBase, report.id);
  assert(reindex.reportId === report.id, "expected report-specific reindex to target generated report");
  assert(reindex.indexed === true || typeof reindex.degradedReason === "string", "expected report-specific vector indexing or explicit degradation");

  const reportSources = await getReportSources(apiBase, report.id);
  assert(Array.isArray(reportSources.sources), "expected report sources array");

  const sourceSearch = await searchSources(apiBase, { query: marker });
  assert(Array.isArray(sourceSearch.sources), "expected source search array");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId: created.task.id,
        reportId: report.id,
        marker,
        knowledgeIndexed: indexedEvent.payload,
        sqlHits: search.reports.length,
        vectorHits: search.vectorHits.length,
        vectorDegradedReason: search.degradedReason,
        reportSourceCount: reportSources.sources.length,
        markerSourceHits: sourceSearch.sources.length,
        reindex
      },
      null,
      2
    )
  );
}

async function waitForTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const task = await getResearchTask(apiBase, taskId);
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

async function waitForEvent(taskId, eventType) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await getResearchTaskEvents(apiBase, taskId);
    const event = events.events?.find((item) => item.eventType === eventType);
    if (event) return event;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${eventType} on task ${taskId}`);
}

async function waitForQueueIdle() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queue = await readJson(`${apiBase}/research/queue`);
    if (queue.pending === 0 && queue.running === 0) return;
    await sleep(pollIntervalMs);
  }
  throw new Error("Timed out waiting for research queue to become idle");
}

async function readJson(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function assertOk(url, label) {
  const response = await fetch(url);
  assert(response.ok, `${label} returned HTTP ${response.status}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
