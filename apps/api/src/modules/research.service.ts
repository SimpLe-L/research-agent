import { Inject, Injectable } from "@nestjs/common";
import type { MemorySearchResult, ResearchClaim, ResearchEvidence, ResearchReport, ResearchRequest, ResearchSource } from "@sp-agent/shared";
import { MemoryService } from "./memory.service.js";
import { ResearchSourceService, type CollectedResearchSource, type ResearchSourceCollection } from "./research-source.service.js";

export type ResearchExecutionNode = {
  nodeId: string;
  label: string;
  payload: Record<string, unknown>;
  degradedReason?: string;
};

export type ResearchExecution = {
  report: ResearchReport;
  nodes: ResearchExecutionNode[];
};

@Injectable()
export class ResearchService {
  constructor(
    @Inject(ResearchSourceService) private readonly sourceService: ResearchSourceService,
    @Inject(MemoryService) private readonly memoryService: MemoryService
  ) {}

  async execute(request: ResearchRequest, workflowId: string, remoteSearch?: ResearchSourceCollection): Promise<ResearchExecution> {
    const startedAt = Date.now();
    const nodes: ResearchExecutionNode[] = [];
    nodes.push({
      nodeId: "validate_source_scope",
      label: "Validate permitted research source scope",
      payload: { scopes: request.sourceScopes, requestedSourceIds: request.sourceIds.length, maxSources: request.maxSources }
    });
    const collectedAt = Date.now();
    const collected = await this.sourceService.collect(request, { includeStoredWeb: !remoteSearch });
    const remoteSources = remoteSearch?.sources ?? [];
    const degradedReasons = uniqueStrings([...collected.degradedReasons, ...(remoteSearch?.degradedReasons ?? [])]);
    if (remoteSearch) {
      nodes.push({
        nodeId: "search_web",
        label: "Search approved web sources",
        payload: { sourceCount: remoteSources.length },
        degradedReason: remoteSearch.degradedReasons.length > 0 ? remoteSearch.degradedReasons.join(" ") : undefined
      });
    }
    nodes.push({
      nodeId: "collect_sources",
      label: "Collect permitted research sources",
      payload: { sourceCount: collected.sources.length + remoteSources.length, scopes: request.sourceScopes, sourceIds: request.sourceIds },
      degradedReason: degradedReasons.length > 0 ? degradedReasons.join(" ") : undefined
    });

    const allCollectedSources = [...collected.sources, ...remoteSources];
    const normalized = normalizeSources(allCollectedSources);
    nodes.push({
      nodeId: "normalize_sources",
      label: "Normalize and deduplicate source content",
      payload: { collected: collected.sources.length, usable: normalized.length }
    });

    const memoryContext = await this.memoryService.retrieveForAgent({ query: request.question, sessionId: request.sessionId, limit: 5 });
    const memorySources = memoryContext.memories.map(toMemorySource);
    nodes.push({
      nodeId: "retrieve_memory",
      label: "Retrieve relevant approved non-sensitive memory",
      payload: { memoryCount: memorySources.length }
    });

    const analysisAt = Date.now();
    const terms = tokenize(request.question);
    const evidence = buildEvidence([...normalized, ...memorySources], terms);
    nodes.push({
      nodeId: "extract_evidence",
      label: "Extract evidence and group it by claim",
      payload: { evidenceCount: evidence.length, queryTerms: terms }
    });

    const claims = buildClaims(request.question, evidence, terms);
    const contested = claims.filter((claim) => claim.status === "contested");
    const insufficient = claims.filter((claim) => claim.status === "insufficient");
    nodes.push({
      nodeId: "compare_evidence",
      label: "Identify supporting, conflicting, and insufficient evidence",
      payload: { claimCount: claims.length, contestedClaimCount: contested.length, insufficientClaimCount: insufficient.length },
      degradedReason: contested.length > 0 ? "Some claims have conflicting evidence." : insufficient.length > 0 ? "Evidence is insufficient for at least one claim." : undefined
    });

    const allSources = [...allCollectedSources.map((item) => item.source), ...memorySources.map((item) => item.source)];
    const uncertainty = buildUncertainty(degradedReasons, claims, evidence, request);
    const report: ResearchReport = {
      id: `research_report_${crypto.randomUUID()}`,
      workflowId,
      request,
      answer: buildAnswer(request.question, claims, allSources.length),
      claims,
      sources: allSources,
      evidence,
      uncertainty,
      openQuestions: buildOpenQuestions(request.question, claims, degradedReasons),
      provider: "deterministic",
      degradedReason: combineDegradedReason(request, degradedReasons),
      metrics: {
        sourceCount: allSources.length,
        evidenceCount: evidence.length,
        citedClaimCount: claims.filter((claim) => claim.supportingEvidenceIds.length > 0 || claim.conflictingEvidenceIds.length > 0).length,
        unsupportedClaimCount: insufficient.length,
        conflictingClaimCount: contested.length,
        memoryCount: memorySources.length,
        collectionMs: Date.now() - collectedAt,
        analysisMs: Date.now() - analysisAt,
        totalMs: Date.now() - startedAt
      },
      createdAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString()
    };
    nodes.push({
      nodeId: "synthesize_report",
      label: "Synthesize a cited research report",
      payload: { reportId: report.id, answerLength: report.answer.length, provider: report.provider },
      degradedReason: report.degradedReason
    });
    nodes.push({
      nodeId: "validate_citations",
      label: "Validate claim citation coverage",
      payload: {
        citedClaimCount: report.metrics.citedClaimCount,
        unsupportedClaimCount: report.metrics.unsupportedClaimCount,
        evidenceCount: report.metrics.evidenceCount
      },
      degradedReason: report.metrics.unsupportedClaimCount > 0 ? "Unsupported claims were marked insufficient instead of presented as conclusions." : undefined
    });

    return { report, nodes };
  }
}

type ResearchContentSource = CollectedResearchSource;

function normalizeSources(sources: CollectedResearchSource[]) {
  const byHash = new Map<string, CollectedResearchSource>();
  for (const source of sources) {
    if (!source.content.trim() || source.source.degradedReason) continue;
    if (!byHash.has(source.source.contentHash)) byHash.set(source.source.contentHash, source);
  }
  return [...byHash.values()];
}

function toMemorySource(memory: MemorySearchResult): ResearchContentSource {
  const citation = memory.citation;
  const source: ResearchSource = {
    id: `memory:${memory.entry.id}`,
    type: "memory",
    title: `Accepted memory: ${memory.entry.kind}`,
    locator: citation?.memoryId ? `memory://${citation.memoryId}` : `memory://${memory.entry.id}`,
    retrievedAt: new Date().toISOString(),
    contentHash: `memory:${memory.entry.id}:${memory.entry.updatedAt}`,
    contentPreview: memory.sourceSnippet ?? memory.entry.content.slice(0, 320),
    metadata: {
      memoryId: memory.entry.id,
      kind: memory.entry.kind,
      confidence: memory.entry.confidence,
      citation
    }
  };
  return { source, content: memory.entry.content };
}

function buildEvidence(sources: ResearchContentSource[], terms: string[]) {
  const now = new Date().toISOString();
  const evidence: ResearchEvidence[] = [];
  for (const item of sources) {
    const requiredMatches = Math.min(2, terms.length);
    const sentences = splitSentences(item.content);
    for (const sentence of sentences) {
      const matchedTerms = terms.filter((term) => sentence.toLowerCase().includes(term));
      if (matchedTerms.length < requiredMatches) continue;
      const score = scoreContent(sentence, matchedTerms);
      evidence.push({
        id: `research_evidence_${crypto.randomUUID()}`,
        sourceId: item.source.id,
        excerpt: sentence,
        locator: item.source.locator,
        relevance: Math.min(1, Number((score / Math.max(terms.length * 2, 1)).toFixed(3))),
        confidence: item.source.type === "memory" ? 0.78 : 0.7,
        extractionMethod: "deterministic",
        queryTerms: matchedTerms,
        createdAt: now
      });
    }
  }
  return evidence
    .sort((left, right) => right.relevance - left.relevance || left.sourceId.localeCompare(right.sourceId))
    .slice(0, 12);
}

function splitSentences(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const sentences = normalized.split(/(?<=[.!?。！？])\s*/u).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [normalized];
}

function buildClaims(question: string, evidence: ResearchEvidence[], terms: string[]) {
  if (evidence.length === 0) {
    return [
      {
        id: `research_claim_${crypto.randomUUID()}`,
        statement: `The permitted sources do not provide enough evidence to answer: ${question}`,
        supportingEvidenceIds: [],
        conflictingEvidenceIds: [],
        confidence: 0,
        status: "insufficient" as const
      }
    ];
  }

  const candidates = evidence.map((item) => ({ evidence: item, statement: sentenceForClaim(item.excerpt, terms) }));
  return candidates.slice(0, 5).map((candidate) => {
    const conflicts = candidates
      .filter((other) => other.evidence.id !== candidate.evidence.id)
      .filter((other) => oppositePolarity(candidate.statement, other.statement))
      .filter((other) => sharedTermCount(candidate.statement, other.statement, terms) >= Math.min(2, terms.length))
      .map((other) => other.evidence.id);
    return {
      id: `research_claim_${crypto.randomUUID()}`,
      statement: candidate.statement,
      supportingEvidenceIds: [candidate.evidence.id],
      conflictingEvidenceIds: conflicts,
      confidence: Number((conflicts.length > 0 ? candidate.evidence.confidence * 0.55 : candidate.evidence.confidence).toFixed(3)),
      status: conflicts.length > 0 ? "contested" as const : "supported" as const
    } satisfies ResearchClaim;
  });
}

function buildAnswer(question: string, claims: ResearchClaim[], sourceCount: number) {
  const supported = claims.filter((claim) => claim.status === "supported");
  const contested = claims.filter((claim) => claim.status === "contested");
  if (supported.length === 0 && contested.length === 0) {
    return `I could not reach a supported conclusion for "${question}" from the permitted sources. The report records the evidence gap instead of inferring an answer.`;
  }
  const conclusion = supported.slice(0, 3).map((claim) => claim.statement).join(" ");
  const conflict = contested.length > 0 ? ` ${contested.length} claim${contested.length === 1 ? " has" : "s have"} conflicting evidence and should be reviewed.` : "";
  return `Based on ${sourceCount} permitted source${sourceCount === 1 ? "" : "s"}, the relevant evidence is: ${conclusion}${conflict}`;
}

function buildUncertainty(degradedReasons: string[], claims: ResearchClaim[], evidence: ResearchEvidence[], request: ResearchRequest) {
  const uncertainty = [...degradedReasons];
  if (evidence.length === 0) uncertainty.push("No permitted source matched the research question.");
  if (claims.some((claim) => claim.status === "contested")) uncertainty.push("Conflicting evidence was found; contested claims require user review.");
  if (request.strategy === "provider_assisted") uncertainty.push("Provider-assisted synthesis is not enabled yet; deterministic synthesis was used.");
  return uniqueStrings(uncertainty);
}

function buildOpenQuestions(question: string, claims: ResearchClaim[], degradedReasons: string[]) {
  const open = [] as string[];
  if (claims.some((claim) => claim.status === "insufficient")) open.push(`Which additional source could answer: ${question}`);
  if (claims.some((claim) => claim.status === "contested")) open.push("Which cited source is more authoritative or current?");
  if (degradedReasons.length > 0) open.push("Should the unavailable permitted sources be retried after their connector is available?");
  return uniqueStrings(open);
}

function combineDegradedReason(request: ResearchRequest, degradedReasons: string[]) {
  const reasons = [...degradedReasons];
  if (request.strategy === "provider_assisted") reasons.push("Provider-assisted research is not enabled; deterministic synthesis was used.");
  return reasons.length > 0 ? uniqueStrings(reasons).join(" ") : undefined;
}

function tokenize(value: string) {
  const terms = value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .filter((term) => !ENGLISH_STOP_WORDS.has(term));
  const expanded = new Set(terms);
  for (const term of terms) {
    if (/[\u4e00-\u9fa5]/u.test(term)) {
      for (let index = 0; index < term.length - 1; index += 1) expanded.add(term.slice(index, index + 2));
    }
  }
  return [...expanded].slice(0, 20);
}

const ENGLISH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "does", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "who", "with"
]);

function scoreContent(content: string, terms: string[]) {
  const lower = content.toLowerCase();
  return terms.reduce((score, term) => score + countOccurrences(lower, term), 0);
}

function excerptForTerms(content: string, terms: string[]) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, first - 120);
  const end = Math.min(normalized.length, start + 420);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

function sentenceForClaim(excerpt: string, terms: string[]) {
  const sentences = excerpt.split(/(?<=[.!?。！？])\s*/u).filter(Boolean);
  const selected = sentences.find((sentence) => terms.some((term) => sentence.toLowerCase().includes(term))) ?? excerpt;
  return selected.trim().slice(0, 360);
}

function oppositePolarity(left: string, right: string) {
  return hasNegation(left) !== hasNegation(right);
}

function hasNegation(value: string) {
  return /\b(no|not|never|without|cannot|can't|doesn't|isn't)\b|不|未|无|禁止|不能|不可/u.test(value.toLowerCase());
}

function sharedTermCount(left: string, right: string, terms: string[]) {
  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();
  return terms.filter((term) => leftLower.includes(term) && rightLower.includes(term)).length;
}

function countOccurrences(value: string, term: string) {
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
