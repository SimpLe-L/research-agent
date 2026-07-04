export async function invokeExtension(apiBase, extensionId, capabilityId, input = {}) {
  const response = await fetch(`${apiBase}/extensions/${encodeURIComponent(extensionId)}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capabilityId, input })
  });
  assert(response.ok, `${extensionId}/${capabilityId} returned HTTP ${response.status}`);
  return response.json();
}

export async function createResearchTask(apiBase, input) {
  return (await invokeExtension(apiBase, "web3.research", "research.create_task", input)).result;
}

export async function getResearchTask(apiBase, taskId) {
  return (await invokeExtension(apiBase, "web3.research", "research.get_task", { taskId })).result;
}

export async function getResearchTaskEvents(apiBase, taskId) {
  return (await invokeExtension(apiBase, "web3.research", "research.list_events", { taskId })).result;
}

export async function getResearchReport(apiBase, taskId) {
  return (await invokeExtension(apiBase, "web3.research", "research.get_report", { taskId })).result;
}

export async function cancelResearchTask(apiBase, taskId) {
  return (await invokeExtension(apiBase, "web3.research", "research.cancel_task", { taskId })).result;
}

export async function searchKnowledge(apiBase, query) {
  return (await invokeExtension(apiBase, "local.knowledge", "knowledge.search", { query })).result;
}

export async function reindexKnowledgeReport(apiBase, reportId) {
  return (await invokeExtension(apiBase, "local.knowledge", "knowledge.index_report", reportId ? { reportId } : {})).result;
}

export async function deleteReportVector(apiBase, reportId) {
  return (await invokeExtension(apiBase, "local.knowledge", "knowledge.delete_report_vector", { reportId })).result;
}

export async function searchSources(apiBase, input = {}) {
  return (await invokeExtension(apiBase, "local.knowledge", "knowledge.search_sources", input)).result;
}

export async function listReports(apiBase) {
  return (await invokeExtension(apiBase, "local.reports", "reports.read", {})).result;
}

export async function getReport(apiBase, reportId) {
  return (await invokeExtension(apiBase, "local.reports", "reports.read_one", { reportId })).result;
}

export async function getReportSources(apiBase, reportId) {
  return (await invokeExtension(apiBase, "local.reports", "reports.read_sources", { reportId })).result;
}

export async function listReportAnnotations(apiBase, reportId) {
  return (await invokeExtension(apiBase, "local.reports", "reports.read_annotations", { reportId })).result;
}

export async function upsertReportAnnotation(apiBase, reportId, input) {
  return (await invokeExtension(apiBase, "local.reports", "reports.upsert_annotation", { reportId, ...input })).result;
}

export async function deleteReportAnnotation(apiBase, reportId, annotationId) {
  return (await invokeExtension(apiBase, "local.reports", "reports.delete_annotation", { reportId, annotationId })).result;
}

export async function analyzeMarketSnapshot(apiBase) {
  return (await invokeExtension(apiBase, "web3.market", "market.snapshot", { analyze: true })).result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
