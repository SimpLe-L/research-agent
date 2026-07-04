import {
  cancelResearchTask,
  createResearchTask,
  deleteReportAnnotation,
  deleteReportVector,
  getResearchReport,
  getResearchTask,
  listReportAnnotations,
  reindexKnowledgeReport,
  upsertReportAnnotation
} from "./smoke-extension-client.mjs";

const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 500);

async function main() {
  await assertOk(`${apiBase}/health`, "health");
  await waitForQueueIdle();

  const queue = await readJson(`${apiBase}/research/queue`);
  assert(queue.mode === "in_memory", `expected in_memory queue mode, got ${queue.mode}`);
  const retentionPreview = await readJson(`${apiBase}/settings/retention/preview?days=365`);
  assert(typeof retentionPreview.databaseReachable === "boolean", "expected retention preview to expose databaseReachable");
  assert(typeof retentionPreview.counts?.researchTasks === "number", "expected retention preview task count");
  const retentionDryRun = await postJson(`${apiBase}/settings/retention/prune`, { days: 365, dryRun: true });
  assert(retentionDryRun.dryRun === true, "expected retention prune smoke to run as dry-run");

  const completedTask = await createTask("API_SMOKE_COMPLETE");
  assert(completedTask.task.status === "pending", `expected new task status pending, got ${completedTask.task.status}`);
  const finalTask = await waitForTask(completedTask.task.id);
  assert(finalTask.status === "completed", `expected task completed, got ${finalTask.status}`);
  const report = await getResearchReport(apiBase, completedTask.task.id);
  const reindexed = await reindexKnowledgeReport(apiBase, report.id);
  assert(reindexed.reportId === report.id, "expected report-specific reindex to return the report id");
  assert(
    reindexed.indexed === true || typeof reindexed.degradedReason === "string",
    "expected report-specific reindex to either index or return a degraded reason"
  );
  const vectorDeleted = await deleteReportVector(apiBase, report.id);
  assert(vectorDeleted.reportId === report.id, "expected vector delete to return the report id");
  assert(typeof vectorDeleted.deleted === "boolean", "expected vector delete to return a boolean deleted flag");
  const annotation = await upsertReportAnnotation(apiBase, report.id, {
    tags: ["api-smoke", "manual-case"],
    note: "API smoke annotation",
    confidence: 77
  });
  assert(annotation.reportId === report.id, "expected annotation to return the report id");
  assert(annotation.tags.includes("api-smoke"), "expected annotation tags to include api-smoke");
  const annotations = await listReportAnnotations(apiBase, report.id);
  assert(
    annotations.annotations.some((item) => item.id === annotation.id),
    "expected saved annotation to be listed"
  );
  const annotationDeleted = await deleteReportAnnotation(apiBase, report.id, annotation.id);
  assert(annotationDeleted.deleted === true, "expected annotation delete to return deleted=true");

  const cancelTaskCount = Math.max(Number(queue.concurrency ?? 2) + 2, 4);
  const cancelTasks = await Promise.all(
    Array.from({ length: cancelTaskCount }, (_, index) => createTask(`API_SMOKE_CANCEL_${index + 1}`))
  );
  const queuedBeforeCancel = await readJson(`${apiBase}/research/queue`);
  const pendingTaskId = cancelTasks.find((item) => queuedBeforeCancel.pendingTaskIds.includes(item.task.id))?.task.id;
  assert(pendingTaskId, "expected at least one pending task before cancel");
  assert(
    queuedBeforeCancel.pendingTaskIds.includes(pendingTaskId),
    `expected ${pendingTaskId} to be pending before cancel`
  );
  const cancelled = await cancelResearchTask(apiBase, pendingTaskId);
  assert(cancelled.cancelled === true, "expected pending cancel response to be cancelled");
  assert(cancelled.task.status === "cancelled", `expected cancelled task status, got ${cancelled.task.status}`);
  const queuedAfterCancel = await readJson(`${apiBase}/research/queue`);
  assert(!queuedAfterCancel.pendingTaskIds.includes(pendingTaskId), `expected ${pendingTaskId} to be removed from queue`);
  await waitForQueueIdle();

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        completedTaskId: completedTask.task.id,
        cancelledPendingTaskId: pendingTaskId,
        queueMode: queue.mode
      },
      null,
      2
    )
  );
}

async function createTask(input) {
  return createResearchTask(apiBase, {
    input,
    inputType: "symbol",
    question: "API smoke",
    options: {
      includeOnchain: false,
      includeSocial: false,
      includeSimilarCases: true
    }
  });
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

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
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
