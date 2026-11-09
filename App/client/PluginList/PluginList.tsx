import { useState } from "react";
import type { PluginInfo } from "../../model/Plugins.js";

export function PluginList({
  plugins,
  worldName,
  busy,
  loaded,
  showInactive,
  onShowInactiveChange,
  onToggle,
  onReorder,
  onFavourite,
}: {
  plugins: readonly PluginInfo[];
  worldName?: string;
  busy: boolean;
  loaded: boolean;
  showInactive: boolean;
  onShowInactiveChange: (show: boolean) => void;
  onToggle: (uuid: string, version: string) => void;
  onReorder: (uuids: readonly string[]) => void;
  onFavourite: (uuids: readonly string[], favourite: boolean) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    name: string;
    after: boolean;
  } | null>(null);
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
          uuids: packs.map((pack) => pack.uuid),
          favourite: packs.some((pack) => pack.favourite),
          activeOrder: Math.min(
            ...packs
              .filter((pack) => pack.versions.some((version) => version.active))
              .map((pack) => pack.activeOrder ?? Number.MAX_SAFE_INTEGER),
          ),
          mixed: new Set(versions.map((version) => version.type)).size > 1,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (a.active
          ? a.activeOrder - b.activeOrder
          : Number(b.favourite) - Number(a.favourite)) ||
        a.name.localeCompare(b.name),
    );
  const activePlugins = grouped.filter((plugin) => plugin.active);
  function movePlugin(source: string, target: string, after: boolean) {
    if (busy || source === target) return;
    const plugin = activePlugins.find((plugin) => plugin.name === source);
    if (!plugin || !activePlugins.some((plugin) => plugin.name === target))
      return;
    const reordered = activePlugins.filter((plugin) => plugin.name !== source);
    const index = reordered.findIndex((plugin) => plugin.name === target);
    reordered.splice(index + Number(after), 0, plugin);
    onReorder(
      reordered.flatMap((plugin) =>
        plugin.versions
          .filter((version) => version.active)
          .map((version) => version.uuid),
      ),
    );
  }
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
            <article
              key={plugin.name}
              className={`pack-card${dragged === plugin.name ? " dragging" : ""}${dropTarget?.name === plugin.name ? (dropTarget.after ? " drop-after" : " drop-before") : ""}`}
              onDragOver={(event) => {
                if (
                  busy ||
                  !dragged ||
                  !plugin.active ||
                  dragged === plugin.name
                )
                  return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  name: plugin.name,
                  after: event.clientY > bounds.top + bounds.height / 2,
                });
              }}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged && plugin.active) {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  movePlugin(
                    dragged,
                    plugin.name,
                    event.clientY > bounds.top + bounds.height / 2,
                  );
                }
                setDragged(null);
                setDropTarget(null);
              }}
            >
              <div className="pack-info">
                <div className="pack-controls">
                  <button
                    type="button"
                    className="pack-icon-button favourite-toggle"
                    disabled={busy}
                    aria-pressed={plugin.favourite}
                    aria-label={`${plugin.favourite ? "Unfavourite" : "Favourite"} ${plugin.name}`}
                    title={
                      plugin.favourite
                        ? "Remove favourite"
                        : "Mark as favourite"
                    }
                    onClick={() => onFavourite(plugin.uuids, !plugin.favourite)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
                    </svg>
                  </button>
                  {plugin.active && (
                    <>
                      <button
                        type="button"
                        className="pack-icon-button drag-handle"
                        disabled={busy || activePlugins.length < 2}
                        draggable={!busy && activePlugins.length > 1}
                        aria-label={`Drag to reorder ${plugin.name}`}
                        title="Drag to change load order, or use the move buttons"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", plugin.name);
                          setDragged(plugin.name);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropTarget(null);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8 5h8M8 10h8M8 15h8M8 20h8" />
                        </svg>
                      </button>
                      <span className="load-order">
                        Load order {activePlugins.indexOf(plugin) + 1}
                      </span>
                      {([-1, 1] as const).map((direction) => {
                        const neighbour =
                          activePlugins[
                            activePlugins.indexOf(plugin) + direction
                          ];
                        return (
                          <button
                            key={direction}
                            type="button"
                            className="pack-icon-button"
                            disabled={busy || !neighbour}
                            aria-label={`Move ${plugin.name} ${direction < 0 ? "up" : "down"}`}
                            onClick={() =>
                              neighbour &&
                              movePlugin(
                                plugin.name,
                                neighbour.name,
                                direction > 0,
                              )
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d={
                                  direction < 0
                                    ? "m6 15 6-6 6 6"
                                    : "m6 9 6 6 6-6"
                                }
                              />
                            </svg>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
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
        appear first in load order; drag their handles or use the move buttons
        to reorder them. Inactive favourites appear before other inactive
        plugins. Switching worlds loads that world's own pack selections and
        load order.
      </p>
    </section>
  );
}
