const apiBase = process.env.SMOKE_API_BASE ?? "http://localhost:4317/api";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 120000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 500);

async function main() {
  await assertOk(`${apiBase}/health`, "health");
  const registry = await readJson(`${apiBase}/extensions`);
  assert(registry.mode === "local_personal_agent", `expected local_personal_agent mode, got ${registry.mode}`);
  assert(
    registry.extensions?.some((extension) => extension.id === "web3.research"),
    "expected web3.research extension"
  );
  assert(
    registry.extensions?.some((extension) => extension.id === "local.knowledge"),
    "expected local.knowledge extension"
  );

  await waitForQueueIdle();
  const taskCreate = await invokeExtension("web3.research", "research.create_task", {
    input: `EXTENSION_SMOKE_${Date.now()}`,
    inputType: "symbol",
    question: "Extension smoke",
    options: {
      includeOnchain: false,
      includeSocial: false,
      includeSimilarCases: false
    }
  });
  assert(taskCreate.status === "queued" || taskCreate.status === "accepted", `expected queued/accepted, got ${taskCreate.status}`);
  assert(taskCreate.permissionAudit?.mode === "write_or_provider", "expected research.create_task audit to be write_or_provider");
  assert(taskCreate.permissionAudit?.permissions?.includes("tasks:write"), "expected research.create_task audit to include tasks:write");
  const taskId = taskCreate.result?.task?.id;
  assert(taskId, "expected extension-created research task id");
  assert(
    hasExtensionEvent(taskCreate.result?.task, "research.create_task"),
    "expected research.create_task to append extension_invoked event"
  );

  const task = await waitForTask(taskId);
  assert(task.status === "completed", `expected extension-created task completed, got ${task.status}`);

  const taskRead = await invokeExtension("web3.research", "research.get_task", { taskId });
  assert(taskRead.result?.id === taskId, "expected research.get_task to return the task");
  assert(taskRead.permissionAudit?.mode === "read_only", "expected research.get_task audit to be read_only");
  assert(hasExtensionEvent(taskRead.result, "research.get_task"), "expected research.get_task to append extension_invoked event");

  const taskList = await invokeExtension("web3.research", "research.list_tasks", {});
  assert(
    taskList.result?.tasks?.some((listedTask) => listedTask.id === taskId),
    "expected research.list_tasks to include extension-created task"
  );
  assert(taskList.permissionAudit?.mode === "read_only", "expected research.list_tasks audit to be read_only");

  const queueStatus = await invokeExtension("web3.research", "research.queue_status", {});
  assert(typeof queueStatus.result?.pending === "number", "expected research.queue_status to include pending count");
  assert(typeof queueStatus.result?.running === "number", "expected research.queue_status to include running count");
  assert(queueStatus.permissionAudit?.mode === "read_only", "expected research.queue_status audit to be read_only");

  const eventList = await invokeExtension("web3.research", "research.list_events", { taskId });
  assert(Array.isArray(eventList.result?.events), "expected research.list_events to return events");
  assert(
    eventList.result.events.some((event) => event.eventType === "extension_invoked"),
    "expected research.list_events to include extension_invoked audit event"
  );
  assert(eventList.permissionAudit?.mode === "read_only", "expected research.list_events audit to be read_only");

  const reportRead = await invokeExtension("web3.research", "research.get_report", { taskId });
  const reportId = reportRead.result?.id;
  assert(reportId, "expected research.get_report to return report id");
  assert(reportRead.permissionAudit?.mode === "read_only", "expected research.get_report audit to be read_only");

  const streamReplay = await readText(`${apiBase}/extensions/web3.research/research/tasks/${encodeURIComponent(taskId)}/events/stream`);
  assert(streamReplay.includes("event: done"), "expected extension research stream to replay done event");
  assert(streamReplay.includes("event: extension_invoked"), "expected extension research stream to include extension_invoked audit event");

  const reportsRead = await invokeExtension("local.reports", "reports.read_one", { reportId });
  assert(reportsRead.result?.id === reportId, "expected reports.read_one to return the report");
  assert(reportsRead.permissionAudit?.mode === "read_only", "expected reports.read_one audit to be read_only");

  const reportSources = await invokeExtension("local.reports", "reports.read_sources", { reportId });
  assert(Array.isArray(reportSources.result?.sources), "expected reports.read_sources to return a sources array");

  const annotationUpsert = await invokeExtension("local.reports", "reports.upsert_annotation", {
    reportId,
    tags: ["extension-smoke"],
    note: "Extension smoke annotation",
    confidence: 80
  });
  assert(annotationUpsert.result?.reportId === reportId, "expected reports.upsert_annotation to return annotation");
  assert(annotationUpsert.permissionAudit?.mode === "write_or_provider", "expected reports.upsert_annotation audit to be write_or_provider");

  const annotationsRead = await invokeExtension("local.reports", "reports.read_annotations", { reportId });
  assert(Array.isArray(annotationsRead.result?.annotations), "expected reports.read_annotations to return annotations");
  assert(
    annotationsRead.result.annotations.some((annotation) => annotation.id === annotationUpsert.result.id),
    "expected reports.read_annotations to include saved annotation"
  );
  assert(annotationsRead.permissionAudit?.mode === "read_only", "expected reports.read_annotations audit to be read_only");

  const annotationDelete = await invokeExtension("local.reports", "reports.delete_annotation", {
    reportId,
    annotationId: annotationUpsert.result.id
  });
  assert(annotationDelete.result?.deleted === true, "expected reports.delete_annotation to delete annotation");
  assert(annotationDelete.permissionAudit?.mode === "write_or_provider", "expected reports.delete_annotation audit to be write_or_provider");

  const knowledgeSearch = await invokeExtension("local.knowledge", "knowledge.search", { query: task.input });
  assert(Array.isArray(knowledgeSearch.result?.reports), "expected knowledge.search to return reports");
  assert(knowledgeSearch.permissionAudit?.mode === "read_only", "expected knowledge.search audit to be read_only");

  const sourceSearch = await invokeExtension("local.knowledge", "knowledge.search_sources", { query: task.input });
  assert(Array.isArray(sourceSearch.result?.sources), "expected knowledge.search_sources to return sources");
  assert(sourceSearch.permissionAudit?.mode === "read_only", "expected knowledge.search_sources audit to be read_only");
  const firstSourceId = sourceSearch.result.sources[0]?.id;
  if (firstSourceId) {
    const sourceDetail = await invokeExtension("local.knowledge", "knowledge.get_source", { sourceId: firstSourceId });
    assert(sourceDetail.result?.source?.id === firstSourceId, "expected knowledge.get_source to return source detail");
    assert(sourceDetail.permissionAudit?.mode === "read_only", "expected knowledge.get_source audit to be read_only");
  }

  const marketList = await invokeExtension("web3.market", "market.list_snapshots", {});
  assert(Array.isArray(marketList.result?.snapshots), "expected market.list_snapshots to return snapshots");
  assert(marketList.permissionAudit?.mode === "read_only", "expected market.list_snapshots audit to be read_only");

  const vectorDelete = await invokeExtension("local.knowledge", "knowledge.delete_report_vector", { reportId });
  assert(vectorDelete.result?.reportId === reportId, "expected knowledge.delete_report_vector to return report id");
  assert(vectorDelete.permissionAudit?.mode === "write_or_provider", "expected knowledge.delete_report_vector audit to be write_or_provider");

  const retry = await invokeExtension("web3.research", "research.retry_task", { taskId });
  const retryTaskId = retry.result?.task?.id;
  assert(retryTaskId, "expected research.retry_task to return a new task id");
  assert(retry.permissionAudit?.mode === "write_or_provider", "expected research.retry_task audit to be write_or_provider");

  const cancel = await invokeExtension("web3.research", "research.cancel_task", { taskId: retryTaskId });
  assert(cancel.result?.task?.id === retryTaskId, "expected research.cancel_task to return the retried task");
  assert(cancel.permissionAudit?.mode === "write_or_provider", "expected research.cancel_task audit to be write_or_provider");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId,
        reportId,
        extensionCount: registry.extensions.length
      },
      null,
      2
    )
  );
}

async function invokeExtension(extensionId, capabilityId, input) {
  return postJson(`${apiBase}/extensions/${encodeURIComponent(extensionId)}/invoke`, {
    capabilityId,
    input
  });
}

async function waitForTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const taskRead = await invokeExtension("web3.research", "research.get_task", { taskId });
    const task = taskRead.result;
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for task ${taskId}`);
}

async function waitForQueueIdle() {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const queueRead = await invokeExtension("web3.research", "research.queue_status", {});
    const queue = queueRead.result;
    if (queue.pending === 0 && queue.running === 0) return;
    await sleep(pollIntervalMs);
  }
  throw new Error("Timed out waiting for research queue to become idle");
}

async function assertOk(url, label) {
  const response = await fetch(url);
  assert(response.ok, `${label} returned HTTP ${response.status}`);
}

async function readJson(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function readText(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.text();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasExtensionEvent(task, capabilityId) {
  return task?.events?.some(
    (event) =>
      event.eventType === "extension_invoked" &&
      event.payload?.capabilityId === capabilityId &&
      event.payload?.extensionId &&
      event.payload?.permissionMode
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
