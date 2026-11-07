import type { ServerStatus } from "../api/MbsCtrl.js";

export function ServerPanel({
  status,
  activeWorld,
  busy,
  refreshing,
  onRefresh,
  onStart,
  onStop,
}: {
  status: ServerStatus | null;
  activeWorld?: string;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const running = status?.status === "active";
  const known = running || status?.status === "stopped";
  return (
    <section className="panel server-panel" aria-labelledby="server-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SERVER OVERVIEW</p>
          <h2 id="server-title">Ready for adventure?</h2>
        </div>
        <span className={`status-badge ${running ? "online" : "offline"}`}>
          <span className="status-dot" aria-hidden="true" />
          {!status
            ? "Checking status"
            : running
              ? "Running"
              : known
                ? "Stopped"
                : "Unknown status"}
        </span>
      </div>
      <dl className="server-stats">
        <div>
          <dt>ACTIVE WORLD</dt>
          <dd>{activeWorld ?? "Loading..."}</dd>
        </div>
        <div>
          <dt>BEDROCK VERSION</dt>
          <dd>{status ? status.version || "Unknown" : "Loading..."}</dd>
        </div>
        <div>
          <dt>SERVER PROCESS</dt>
          <dd>{!known ? "Checking" : running ? "Online" : "Offline"}</dd>
        </div>
      </dl>
      <div className="server-toolbar">
        <div className="actions">
          <button
            type="button"
            className="button primary"
            disabled={busy || !known}
            onClick={onStart}
          >
            {running ? "Restart server" : "Start server"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !running}
            onClick={onStop}
          >
            Stop server
          </button>
        </div>
        <button
          type="button"
          className="button ghost"
          disabled={busy}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing..." : "Refresh status"}
        </button>
      </div>
      <p className="hint">
        Status refreshes every 10 seconds. A running process may still be
        loading its world.
      </p>
    </section>
  );
}
