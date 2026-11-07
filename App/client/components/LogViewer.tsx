import { useEffect, useRef, useState } from "react";
import type { LogSnapshot } from "../../model/Logs.js";
import { getServerLogs } from "../api/MbsCtrl.js";

export function LogViewer({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [retry, setRetry] = useState(0);
  const output = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!active || paused) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh() {
      const [data, failure] = await getServerLogs(controller.signal);
      if (controller.signal.aborted) return;
      setError(failure?.message ?? null);
      if (data) setSnapshot(data);
      timer = window.setTimeout(() => void refresh(), 2_000);
    }
    void refresh();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, paused, retry]);

  useEffect(() => {
    if (active && follow && output.current) {
      output.current.scrollTop = output.current.scrollHeight;
    }
  }, [active, follow, snapshot]);

  return (
    <section className="panel" aria-labelledby="logs-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SERVER OUTPUT</p>
          <h2 id="logs-title">Bedrock logs</h2>
        </div>
        <span className={`status-badge ${!paused && !error ? "online" : ""}`}>
          {paused ? "Paused" : error ? "Connection error" : "Live"}
        </span>
      </div>
      <p className="section-description">
        Server stdout and stderr, refreshed every two seconds while this tab is
        open. Showing up to the latest 64 KiB; older output stays in the log
        file.
      </p>
      <div className="actions log-toolbar">
        <button
          type="button"
          className="button secondary"
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume logs" : "Pause logs"}
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          Auto-scroll
        </label>
      </div>
      {error && (
        <div className="notice error" role="alert">
          <p>
            Could not refresh logs. Displayed output may be out of date. {error}
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setPaused(false);
              setRetry((value) => value + 1);
            }}
          >
            Retry logs
          </button>
        </div>
      )}
      {snapshot?.truncated && (
        <p className="hint">
          Older output omitted; the first line may be partial.
        </p>
      )}
      <pre
        ref={output}
        className="log-output"
        tabIndex={0}
        aria-label="Bedrock server log output"
      >
        {snapshot
          ? !snapshot.available
            ? "No Bedrock log file yet. Start the server to create it."
            : snapshot.text || "No server output yet."
          : error
            ? "Log output unavailable."
            : "Loading logs..."}
      </pre>
    </section>
  );
}
