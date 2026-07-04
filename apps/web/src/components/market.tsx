import { RefreshCw } from "lucide-react";

export type MarketSnapshot = {
  id: string;
  scope: string;
  metrics: Record<string, unknown>;
  regime: string;
  recommendation: string;
  confidence: number;
  summary: string;
  degradedReasons: string[];
  createdAt: string;
};

export function MarketView({
  snapshots,
  latestSnapshot,
  onRefresh,
  onAnalyze,
  onSelectSnapshot
}: {
  snapshots: MarketSnapshot[];
  latestSnapshot: MarketSnapshot | null;
  onRefresh: () => void;
  onAnalyze: () => void;
  onSelectSnapshot: (snapshot: MarketSnapshot) => void;
}) {
  return (
    <section className="viewGrid marketGrid" data-testid="view-market">
      <section className="panel">
        <div className="panelHeader">
          <h2>Snapshot History</h2>
          <button className="iconButton" onClick={onRefresh} title="Refresh market">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="taskList">
          {snapshots.map((snapshot) => (
            <button key={snapshot.id} className="task" onClick={() => onSelectSnapshot(snapshot)}>
              <span>{snapshot.regime}</span>
              <small>
                {snapshot.recommendation} / confidence {snapshot.confidence}
              </small>
            </button>
          ))}
          {!snapshots.length && <p className="empty">No market snapshots yet.</p>}
        </div>
      </section>
      <section className="panel wide">
        <div className="panelHeader">
          <h2>Latest Market Analysis</h2>
          <button onClick={onAnalyze}>Run Analysis</button>
        </div>
        {latestSnapshot ? (
          <div className="snapshotDetail">
            <div className="metricRow">
              <Metric label="Regime" value={latestSnapshot.regime} />
              <Metric label="Recommendation" value={latestSnapshot.recommendation} />
              <Metric label="Confidence" value={`${latestSnapshot.confidence}`} />
            </div>
            <p>{latestSnapshot.summary}</p>
            <dl className="metricList">
              {Object.entries(latestSnapshot.metrics).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
            <DegradedList reasons={latestSnapshot.degradedReasons} />
          </div>
        ) : (
          <p className="empty">Run a market analysis to create the first snapshot.</p>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DegradedList({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <div className="degradedList">
      <h2>Degraded Reasons</h2>
      {reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}
