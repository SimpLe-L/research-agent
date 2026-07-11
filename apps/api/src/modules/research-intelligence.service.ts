import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  researchPlanSchema,
  type ResearchEvidence,
  type ResearchPlan,
  type ResearchProviderRunInput,
  type ResearchSource
} from "@sp-agent/shared";

const SILICONFLOW_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_RESEARCH_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

const synthesisSchema = z.object({
  answer: z.string().min(1).max(8_000),
  claims: z.array(
    z.object({
      statement: z.string().min(1).max(800),
      evidenceIds: z.array(z.string().min(1)).min(1).max(8),
      confidence: z.number().min(0).max(1)
    })
  ).max(8),
  uncertainty: z.array(z.string().min(1).max(500)).max(12),
  openQuestions: z.array(z.string().min(1).max(500)).max(12)
});

export type ResearchSynthesis = z.infer<typeof synthesisSchema>;

@Injectable()
export class ResearchIntelligenceService {
  getStatus(env: NodeJS.ProcessEnv = process.env) {
    const configured = Boolean(env.SILICONFLOW_API_KEY);
    return {
      name: `siliconflow:${researchModel(env)}`,
      configured,
      reachable: configured,
      degradedReason: configured ? undefined : "Research intelligence requires SILICONFLOW_API_KEY."
    };
  }

  async createPlan(input: ResearchProviderRunInput, env: NodeJS.ProcessEnv = process.env): Promise<ResearchPlan> {
    const json = await this.callJson(
      [
        {
          role: "system",
          content: [
            "You are a research planner for a local-first decision-support agent.",
            "Return strict JSON only. Choose connectorIds only from: local_documents, local_bookmarks, user_provided_sources, tavily_web_search.",
            "Choose matching sourceScopes only from: local_documents, bookmarks, user_provided, web. tavily_web_search maps to web and never means unrestricted browsing.",
            "Do not recommend transactions, personalized financial actions, or facts unsupported by future collected evidence.",
          "Return {decisionType,objective,researchQuestions,requiredDimensions,connectorIds,sourceScopes,maxSources,maxWebResults,freshness,rationale}."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            budget: { maxSources: input.maxSources, maxWebResults: input.maxWebResults },
            registeredSources: {
              local_documents: "allowlisted project documents",
              local_bookmarks: "user-configured local bookmarks",
              user_provided_sources: "approved imported sources",
              tavily_web_search: "approved Tavily web search snippets with URL and retrieval time"
            }
          })
        }
      ],
      env
    );
    return researchPlanSchema.parse(json);
  }

  async synthesize(
    input: { question: string; plan: ResearchPlan; sources: ResearchSource[]; evidence: ResearchEvidence[] },
    env: NodeJS.ProcessEnv = process.env
  ): Promise<ResearchSynthesis> {
    const json = await this.callJson(
      [
        {
          role: "system",
          content: [
            "You synthesize an evidence-backed research report for a local-first decision-support agent.",
            "Return strict JSON only: {answer,claims:[{statement,evidenceIds,confidence}],uncertainty,openQuestions}.",
            "Every claim must cite one or more supplied evidenceIds. Do not cite source ids directly.",
            "Do not use unstated world knowledge, invent facts, give personalized investment instructions, or recommend transactions.",
            "When evidence is weak or conflicting, state uncertainty rather than forcing a conclusion."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            plan: input.plan,
            sources: input.sources.map((source) => ({ id: source.id, title: source.title, locator: source.locator, retrievedAt: source.retrievedAt })),
            evidence: input.evidence.map((evidence) => ({ id: evidence.id, sourceId: evidence.sourceId, excerpt: evidence.excerpt, locator: evidence.locator }))
          })
        }
      ],
      env
    );
    return synthesisSchema.parse(json);
  }

  private async callJson(messages: Array<{ role: "system" | "user"; content: string }>, env: NodeJS.ProcessEnv) {
    if (!env.SILICONFLOW_API_KEY) throw new Error("Research intelligence requires SILICONFLOW_API_KEY.");
    const baseUrl = (env.SILICONFLOW_BASE_URL || SILICONFLOW_DEFAULT_BASE_URL).replace(/\/+$/u, "");
    const timeout = Number(env.RESEARCH_INTELLIGENCE_TIMEOUT_MS ?? 60_000);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SILICONFLOW_API_KEY}`
      },
      body: JSON.stringify({
        model: researchModel(env),
        messages,
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000)
    });
    if (!response.ok) throw new Error(`Research intelligence returned HTTP ${response.status}: ${await response.text()}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Research intelligence response did not include JSON content.");
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("Research intelligence returned invalid JSON.");
    }
  }
}

function researchModel(env: NodeJS.ProcessEnv) {
  return env.RESEARCH_INTELLIGENCE_MODEL || env.PI_MODEL_ID || env.PI_SILICONFLOW_MODEL || DEFAULT_RESEARCH_MODEL;
}
