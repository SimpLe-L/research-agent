import { RefreshCw } from "lucide-react";

export type ReadinessItem = {
  id: string;
  label: string;
  status: "ready" | "missing" | "degraded" | "manual";
  capability: string;
  envVars: string[];
  envTemplate?: string;
  action: string;
  docsHint?: string;
};

export type RetentionPreview = {
  days: number;
  cutoff: string;
  dryRun?: boolean;
  databaseReachable: boolean;
  counts: {
    researchTasks: number;
    reports: number;
    chatSessions: number;
    marketSnapshots: number;
    sourceDocuments: number;
  };
  degradedReason?: string;
};

export function DataRetentionPanel({
  days,
  preview,
  status,
  onDaysChange,
  onPreview,
  onDryRun
}: {
  days: string;
  preview: RetentionPreview | null;
  status: string;
  onDaysChange: (value: string) => void;
  onPreview: () => void;
  onDryRun: () => void;
}) {
  const counts = preview?.counts;
  return (
    <section className="panel" data-testid="retention-panel">
      <div className="sectionHeader">
        <h2>Data Retention</h2>
        <button className="smallAction" data-testid="retention-preview" onClick={onPreview}>Preview</button>
      </div>
      <div className="retentionControls">
        <input value={days} onChange={(event) => onDaysChange(event.target.value)} placeholder="Retention days" />
        <button className="smallAction" data-testid="retention-dry-run" onClick={onDryRun}>Dry-run prune</button>
      </div>
      {status && <p className="actionStatus">{status}</p>}
      {preview ? (
        <div className="retentionSummary">
          <span>{preview.databaseReachable ? "PostgreSQL reachable" : "PostgreSQL unavailable"}</span>
          <small>Cutoff {new Date(preview.cutoff).toLocaleString()}</small>
          {preview.degradedReason && <em>{preview.degradedReason}</em>}
          <dl className="metricList compactMetrics">
            <div>
              <dt>Tasks</dt>
              <dd>{counts?.researchTasks ?? 0}</dd>
            </div>
            <div>
              <dt>Reports</dt>
              <dd>{counts?.reports ?? 0}</dd>
            </div>
            <div>
              <dt>Chats</dt>
              <dd>{counts?.chatSessions ?? 0}</dd>
            </div>
            <div>
              <dt>Market</dt>
              <dd>{counts?.marketSnapshots ?? 0}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{counts?.sourceDocuments ?? 0}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="empty">Preview local retention impact before pruning old records.</p>
      )}
    </section>
  );
}

export function ReadinessPanel({
  items,
  selectedItemId,
  onSelect,
  onAction,
  onRefresh
}: {
  items: ReadinessItem[];
  selectedItemId?: string;
  onSelect: (itemId: string) => void;
  onAction: (item: ReadinessItem) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="panel wide" data-testid="readiness-panel">
      <div className="sectionHeader">
        <h2>Readiness</h2>
        <button className="iconButton" onClick={onRefresh} title="Refresh readiness">
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="readinessList">
        {items.map((item) => (
          <div key={item.id} className={`readinessItem ${item.status} ${item.id === selectedItemId ? "active" : ""}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.capability}</span>
            </div>
            <small>{item.envVars.length ? item.envVars.join(", ") : "manual local action"}</small>
            <p>{item.action}</p>
            {item.docsHint && <em>{item.docsHint}</em>}
            <div className="readinessActions">
              <button data-testid={`readiness-inspect-${item.id}`} onClick={() => onSelect(item.id)}>Inspect</button>
              <button data-testid={`readiness-action-${item.id}`} onClick={() => onAction(item)}>{readinessActionLabel(item.id)}</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="empty">Readiness checklist unavailable.</p>}
      </div>
    </section>
  );
}

export function EnvSetupReference({
  item,
  onCopy,
  onAction
}: {
  item: ReadinessItem | null;
  onCopy: (item: ReadinessItem) => void;
  onAction: (item: ReadinessItem) => void;
}) {
  return (
    <section className="panel" data-testid="env-setup-panel">
      <h2>Env Setup Reference</h2>
      {item ? (
        <div className="envReference">
          <div className={`statusPill ${item.status}`}>{item.status}</div>
          <strong>{item.label}</strong>
          <p>{item.action}</p>
          {item.envVars.length ? (
            <>
              <div className="envVarList">
                {item.envVars.map((envVar) => (
                  <code key={envVar}>{envVar}</code>
                ))}
              </div>
              <pre>{readinessEnvTemplate(item)}</pre>
            </>
          ) : (
            <p className="empty">This item requires a manual local action rather than an environment variable.</p>
          )}
          <div className="readinessActions">
            {item.envVars.length > 0 && <button data-testid="env-copy" onClick={() => onCopy(item)}>Copy Env Template</button>}
            <button data-testid="env-action" onClick={() => onAction(item)}>{readinessActionLabel(item.id)}</button>
          </div>
        </div>
      ) : (
        <p className="empty">Select a readiness item to inspect the required setup.</p>
      )}
    </section>
  );
}

export function readinessEnvTemplate(item: ReadinessItem): string {
  return item.envTemplate?.trim() || item.envVars.map((envVar) => `${envVar}=`).join("\n");
}

function readinessActionLabel(itemId: string): string {
  if (itemId === "coingecko") return "Run Market";
  if (itemId === "evm-rpc" || itemId === "arkham") return "Open Research";
  if (itemId === "holder-concentration") return "Show Degraded Sources";
  if (itemId === "siliconflow") return "Open Knowledge";
  if (itemId === "electron-runtime") return "Review Setup";
  return "Open Action";
}
