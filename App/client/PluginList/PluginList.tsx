import type { PluginInfo } from "../../model/Plugins.js";

export function PluginList({
  plugins,
  worldName,
  busy,
  loaded,
  showInactive,
  onShowInactiveChange,
  onToggle,
}: {
  plugins: readonly PluginInfo[];
  worldName?: string;
  busy: boolean;
  loaded: boolean;
  showInactive: boolean;
  onShowInactiveChange: (show: boolean) => void;
  onToggle: (uuid: string, version: string) => void;
}) {
  const grouped = Object.values(
    Object.groupBy(plugins, (plugin) => plugin.name),
  )
    .flatMap((packs) => {
      if (!packs) return [];
      const versions = packs.flatMap((pack) => pack.versions);
      const active = versions.some((version) => version.active);
      return [
        {
          name: packs[0].name,
          description: packs[0].description,
          authors: [...new Set(packs.flatMap((pack) => pack.authors ?? []))],
          versions,
          active,
          mixed: new Set(versions.map((version) => version.type)).size > 1,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
  const visible = grouped.filter((plugin) => showInactive || plugin.active);
  return (
    <section className="panel" aria-labelledby="packs-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKE IT YOUR OWN</p>
          <h2 id="packs-title">
            Packs &amp; plugins{" "}
            <span className="count">{loaded ? grouped.length : "..."}</span>
          </h2>
        </div>
        <span className="tag">WORLD-SPECIFIC</span>
      </div>
      <p className="section-description">
        Pack selection for <strong>{worldName ?? "your active world"}</strong>.
        Restart the server after changing packs.
      </p>
      <label className="checkbox-label pack-filter">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(event) => onShowInactiveChange(event.target.checked)}
        />
        Show inactive plugins
      </label>
      {!loaded ? (
        <p className="empty-state">Loading packs...</p>
      ) : !grouped.length ? (
        <p className="empty-state">
          No development packs found. Deploy a pack to make it available here.
        </p>
      ) : !visible.length ? (
        <p className="empty-state">
          No active plugins. Show inactive plugins to choose packs.
        </p>
      ) : (
        <div className="pack-list">
          {visible.map((plugin) => (
            <article key={plugin.name} className="pack-card">
              <div className="pack-info">
                <span className="pack-kind">
                  {plugin.mixed
                    ? "Behaviour & resource packs"
                    : plugin.versions[0]?.type === "behaviour"
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
                {plugin.versions.map(({ uuid, version, active, type }) => (
                  <button
                    type="button"
                    key={type + uuid + version.join(".")}
                    className={`version-toggle ${active ? "active" : ""}`}
                    disabled={busy}
                    aria-pressed={active}
                    aria-label={`${active ? "Deactivate" : "Activate"} ${plugin.name}${plugin.mixed ? ` ${type === "behaviour" ? "behaviour" : "resource"} pack` : ""} version ${version.join(".")}`}
                    onClick={() => onToggle(uuid, version.join("."))}
                  >
                    {plugin.mixed && (
                      <span className="version-state">
                        {type === "behaviour" ? "Behaviour" : "Resource"}
                      </span>
                    )}
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
        One version per pack can be active. Matching names share a card;
        behaviour and resource packs are activated separately. Active plugins
        appear first. Switching worlds loads that world's own pack selections.
      </p>
    </section>
  );
}
