import { integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const researchTasks = pgTable("research_tasks", {
  id: text("id").primaryKey(),
  input: text("input").notNull(),
  inputType: text("input_type").notNull(),
  status: text("status").notNull(),
  currentNode: text("current_node"),
  question: text("question").notNull(),
  optionsJson: jsonb("options_json").notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const researchTaskEvents = pgTable("research_task_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  node: text("node"),
  eventType: text("event_type").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const tokens = pgTable("tokens", {
  id: text("id").primaryKey(),
  chain: text("chain").notNull(),
  address: text("address").notNull(),
  symbol: text("symbol"),
  name: text("name"),
  decimals: integer("decimals"),
  coingeckoId: text("coingecko_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const tokenProfiles = pgTable("token_profiles", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull(),
  category: text("category"),
  mechanismSummary: text("mechanism_summary"),
  teamSummary: text("team_summary"),
  fundingSummary: text("funding_summary"),
  tokenomicsSummary: text("tokenomics_summary"),
  metricsJson: jsonb("metrics_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const riskAssessments = pgTable("risk_assessments", {
  id: text("id").primaryKey(),
  tokenId: text("token_id"),
  taskId: text("task_id").notNull(),
  totalScore: integer("total_score").notNull(),
  level: text("level").notNull(),
  contractScore: integer("contract_score").notNull(),
  liquidityScore: integer("liquidity_score").notNull(),
  concentrationScore: integer("concentration_score").notNull(),
  valuationScore: integer("valuation_score").notNull(),
  socialScore: integer("social_score").notNull(),
  missingDataScore: integer("missing_data_score").notNull(),
  caseScore: integer("case_score").notNull(),
  detailJson: jsonb("detail_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  tokenId: text("token_id"),
  title: text("title").notNull(),
  markdown: text("markdown").notNull(),
  summary: text("summary").notNull(),
  recommendation: text("recommendation").notNull(),
  confidence: numeric("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const reportAnnotations = pgTable("report_annotations", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull(),
  tagsJson: jsonb("tags_json").notNull().default([]),
  note: text("note").notNull().default(""),
  confidence: numeric("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sourceDocuments = pgTable("source_documents", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  url: text("url"),
  title: text("title"),
  contentText: text("content_text"),
  contentHash: text("content_hash"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json").notNull().default({})
});

export const marketSnapshots = pgTable("market_snapshots", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  metricsJson: jsonb("metrics_json").notNull().default({}),
  regime: text("regime").notNull(),
  recommendation: text("recommendation").notNull(),
  confidence: numeric("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const watchlistItems = pgTable("watchlist_items", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull(),
  note: text("note"),
  riskLevel: text("risk_level"),
  monitorRulesJson: jsonb("monitor_rules_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
