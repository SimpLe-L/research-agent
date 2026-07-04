import { RefreshCw } from "lucide-react";
import {
  DataRetentionPanel,
  EnvSetupReference,
  ReadinessPanel,
  type ReadinessItem,
  type RetentionPreview
} from "./readiness";

export type ProviderStatus = {
  name: string;
  configured: boolean;
  reachable: boolean;
  degradedReason?: string;
};

export function SettingsView({
  providerStatuses,
  readinessItems,
  selectedReadinessItem,
  retentionDays,
  retentionPreview,
  retentionStatus,
  onRefreshProviders,
  onRefreshReadiness,
  onSelectReadiness,
  onReadinessAction,
  onCopyReadinessEnv,
  onRetentionDaysChange,
  onPreviewRetention,
  onDryRunRetention
}: {
  providerStatuses: ProviderStatus[];
  readinessItems: ReadinessItem[];
  selectedReadinessItem: ReadinessItem | null;
  retentionDays: string;
  retentionPreview: RetentionPreview | null;
  retentionStatus: string;
  onRefreshProviders: () => void | Promise<void>;
  onRefreshReadiness: () => void | Promise<void>;
  onSelectReadiness: (itemId: string) => void;
  onReadinessAction: (item: ReadinessItem) => void | Promise<void>;
  onCopyReadinessEnv: (item: ReadinessItem) => void | Promise<void>;
  onRetentionDaysChange: (value: string) => void;
  onPreviewRetention: () => void | Promise<void>;
  onDryRunRetention: () => void | Promise<void>;
}) {
  return (
    <section className="viewGrid settingsGrid" data-testid="view-settings">
      <section className="panel">
        <div className="panelHeader">
          <h2>Provider Status</h2>
          <button className="iconButton" onClick={() => { void onRefreshProviders(); }} title="Refresh providers">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="providerList">
          {providerStatuses.map((provider) => (
            <div key={provider.name} className={`providerItem ${provider.reachable ? "ready" : "degraded"}`}>
              <strong>{provider.name}</strong>
              <span>{provider.configured ? "configured" : "not configured"} / {provider.reachable ? "reachable" : "degraded"}</span>
              {provider.degradedReason && <em>{provider.degradedReason}</em>}
            </div>
          ))}
          {!providerStatuses.length && <p className="empty">Provider status unavailable.</p>}
        </div>
      </section>
      <ReadinessPanel
        items={readinessItems}
        selectedItemId={selectedReadinessItem?.id}
        onSelect={onSelectReadiness}
        onAction={(item) => {
          void onReadinessAction(item);
        }}
        onRefresh={() => {
          void onRefreshProviders();
          void onRefreshReadiness();
        }}
      />
      <EnvSetupReference
        item={selectedReadinessItem}
        onCopy={(item) => {
          void onCopyReadinessEnv(item);
        }}
        onAction={(item) => {
          void onReadinessAction(item);
        }}
      />
      <DataRetentionPanel
        days={retentionDays}
        preview={retentionPreview}
        status={retentionStatus}
        onDaysChange={onRetentionDaysChange}
        onPreview={() => { void onPreviewRetention(); }}
        onDryRun={() => { void onDryRunRetention(); }}
      />
    </section>
  );
}
