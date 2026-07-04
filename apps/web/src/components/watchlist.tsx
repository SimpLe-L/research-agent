import { RefreshCw } from "lucide-react";

export type WatchlistItem = {
  id: string;
  tokenId: string;
  input: string;
  note?: string;
  riskLevel?: string;
  monitorRules: Record<string, unknown>;
  createdAt: string;
};

export type WatchlistEdit = {
  note: string;
  riskLevel: string;
};

const riskLevels = ["Low", "Medium", "High", "Critical"];

export function WatchlistView({
  input,
  note,
  risk,
  items,
  edits,
  onInputChange,
  onNoteChange,
  onRiskChange,
  onCreate,
  onRefresh,
  onEditChange,
  onSave,
  onRemove,
  onResearch
}: {
  input: string;
  note: string;
  risk: string;
  items: WatchlistItem[];
  edits: Record<string, WatchlistEdit>;
  onInputChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onRiskChange: (value: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onEditChange: (itemId: string, edit: WatchlistEdit) => void;
  onSave: (item: WatchlistItem) => void;
  onRemove: (itemId: string) => void;
  onResearch: (input: string) => void;
}) {
  return (
    <section className="viewGrid watchlistGrid" data-testid="view-watchlist">
      <section className="panel">
        <h2>Add Watch Item</h2>
        <div className="formStack">
          <input value={input} onChange={(event) => onInputChange(event.target.value)} placeholder="Token address, symbol, or project name" />
          <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Note or thesis" />
          <select value={risk} onChange={(event) => onRiskChange(event.target.value)}>
            {riskLevels.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
          <button onClick={onCreate}>Add To Watchlist</button>
        </div>
      </section>
      <section className="panel wide">
        <div className="panelHeader">
          <h2>Watchlist Items</h2>
          <button className="iconButton" onClick={onRefresh} title="Refresh watchlist">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="watchlistRows">
          {items.map((item) => {
            const edit = edits[item.id] ?? { note: item.note ?? "", riskLevel: item.riskLevel ?? "Medium" };
            return (
              <div key={item.id} className="watchlistRow">
                <div>
                  <strong>{item.input}</strong>
                  <span>{item.riskLevel ?? "Unrated"} / {new Date(item.createdAt).toLocaleString()}</span>
                  <div className="watchlistEdit">
                    <textarea
                      value={edit.note}
                      onChange={(event) => onEditChange(item.id, { note: event.target.value, riskLevel: edit.riskLevel })}
                      placeholder="Note or thesis"
                    />
                    <select value={edit.riskLevel} onChange={(event) => onEditChange(item.id, { note: edit.note, riskLevel: event.target.value })}>
                      {riskLevels.map((level) => (
                        <option key={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rowActions">
                  <button onClick={() => onSave(item)}>Save</button>
                  <button onClick={() => onRemove(item.id)}>Remove</button>
                  <button onClick={() => onResearch(item.input)}>Research</button>
                </div>
              </div>
            );
          })}
          {!items.length && <p className="empty">No watchlist items yet.</p>}
        </div>
      </section>
    </section>
  );
}
