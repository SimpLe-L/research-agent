import type { DatabaseClient } from "./client.js";

type Migration = {
  id: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    id: "0001_initial_schema",
    sql: `
create table if not exists chat_sessions (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null,
  role text not null,
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists research_tasks (
  id text primary key,
  input text not null,
  input_type text not null,
  status text not null,
  current_node text,
  question text not null,
  options_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create table if not exists research_task_events (
  id text primary key,
  task_id text not null references research_tasks(id) on delete cascade,
  node text,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists research_task_events_task_created_idx
  on research_task_events(task_id, created_at);

create table if not exists tokens (
  id text primary key,
  chain text not null,
  address text not null,
  symbol text,
  name text,
  decimals integer,
  coingecko_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tokens_chain_address_idx on tokens(chain, address);

create table if not exists token_profiles (
  id text primary key,
  token_id text not null references tokens(id) on delete cascade,
  category text,
  mechanism_summary text,
  team_summary text,
  funding_summary text,
  tokenomics_summary text,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists risk_assessments (
  id text primary key,
  token_id text references tokens(id) on delete set null,
  task_id text not null references research_tasks(id) on delete cascade,
  total_score integer not null,
  level text not null,
  contract_score integer not null,
  liquidity_score integer not null,
  concentration_score integer not null,
  valuation_score integer not null,
  social_score integer not null,
  missing_data_score integer not null,
  case_score integer not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id text primary key,
  task_id text not null references research_tasks(id) on delete cascade,
  token_id text references tokens(id) on delete set null,
  title text not null,
  markdown text not null,
  summary text not null,
  recommendation text not null,
  confidence numeric not null,
  created_at timestamptz not null
);

create table if not exists source_documents (
  id text primary key,
  source_type text not null,
  url text,
  title text,
  content_text text,
  content_hash text,
  fetched_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists report_sources (
  report_id text not null references reports(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  usage_type text not null,
  primary key (report_id, source_document_id)
);

create table if not exists case_patterns (
  id text primary key,
  name text not null,
  description text not null,
  tags_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists token_case_tags (
  token_id text not null references tokens(id) on delete cascade,
  case_pattern_id text not null references case_patterns(id) on delete cascade,
  confidence numeric not null,
  evidence_json jsonb not null default '{}'::jsonb,
  primary key (token_id, case_pattern_id)
);

create table if not exists market_snapshots (
  id text primary key,
  scope text not null,
  metrics_json jsonb not null default '{}'::jsonb,
  regime text not null,
  recommendation text not null,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists watchlist_items (
  id text primary key,
  token_id text not null references tokens(id) on delete cascade,
  note text,
  risk_level text,
  monitor_rules_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
`
  },
  {
    id: "0002_report_annotations",
    sql: `
create table if not exists report_annotations (
  id text primary key,
  report_id text not null references reports(id) on delete cascade,
  tags_json jsonb not null default '[]'::jsonb,
  note text not null default '',
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_annotations_report_idx
  on report_annotations(report_id);
`
  }
];

export async function migrateDatabase(client: DatabaseClient): Promise<void> {
  const connection = await client.pool.connect();
  try {
    await connection.query("begin");
    await connection.query(`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    for (const migration of migrations) {
      const existing = await connection.query("select id from schema_migrations where id = $1", [migration.id]);
      if (existing.rowCount) continue;
      await connection.query(migration.sql);
      await connection.query("insert into schema_migrations (id) values ($1)", [migration.id]);
    }

    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
}
