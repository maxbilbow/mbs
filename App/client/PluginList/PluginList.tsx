import type { PluginInfo } from "../../model/Plugins.js";

export function PluginList({
  plugins,
  worldName,
  busy,
  loaded,
  onToggle,
}: {
  plugins: readonly PluginInfo[];
  worldName?: string;
  busy: boolean;
  loaded: boolean;
  onToggle: (uuid: string, version: string) => void;
}) {
  return (
    <section className="panel" aria-labelledby="packs-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKE IT YOUR OWN</p>
          <h2 id="packs-title">
            Packs &amp; plugins{" "}
            <span className="count">{loaded ? plugins.length : "..."}</span>
          </h2>
        </div>
        <span className="tag">WORLD-SPECIFIC</span>
      </div>
      <p className="section-description">
        Pack selection for <strong>{worldName ?? "your active world"}</strong>.
        Restart the server after changing packs.
      </p>
      {!loaded ? (
        <p className="empty-state">Loading packs...</p>
      ) : !plugins.length ? (
        <p className="empty-state">
          No development packs found. Deploy a pack to make it available here.
        </p>
      ) : (
        <div className="pack-list">
          {plugins.map((plugin) => (
            <article key={plugin.uuid} className="pack-card">
              <div className="pack-info">
                <span className="pack-kind">
                  {plugin.type === "behaviour"
                    ? "Behaviour pack"
                    : "Resource pack"}
                </span>
                <h3>{plugin.name}</h3>
                <p className="pack-authors">
                  {plugin.authors?.length
                    ? `By ${plugin.authors.join(", ")}`
                    : "Author not specified"}
                </p>
                <p>{plugin.description}</p>
              </div>
              <div
                className="version-list"
                aria-label={`Versions of ${plugin.name}`}
              >
                {plugin.versions.map(({ uuid, version, active }) => (
                  <button
                    type="button"
                    key={uuid + version.join(".")}
                    className={`version-toggle ${active ? "active" : ""}`}
                    disabled={busy}
                    aria-pressed={active}
                    aria-label={`${active ? "Deactivate" : "Activate"} ${plugin.name} version ${version.join(".")}`}
                    onClick={() => onToggle(uuid, version.join("."))}
                  >
                    <span>v{version.join(".")}</span>
                    <span className="version-state">
                      {active ? "Active" : "Inactive"}
                    </span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="hint">
        One version per pack can be active. Switching worlds loads that world's
        own pack selections.
      </p>
    </section>
  );
}
