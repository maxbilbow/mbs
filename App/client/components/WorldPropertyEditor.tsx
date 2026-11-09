import { useEffect, useRef, useState } from "react";
import type { WorldProperties } from "../../model/Worlds.js";
import { fetchWorldProperties } from "../api/Worlds.js";
import {
  PROPERTY_CATEGORIES,
  propertyCategory,
} from "./worldPropertyCategories.js";

export type SaveProperties = (
  name: string,
  overrides: Record<string, string>,
  revision: string,
) => Promise<boolean>;

export function WorldPropertyEditor({
  name,
  busy,
  onSave,
  onClose,
}: {
  name: string;
  busy: boolean;
  onSave: SaveProperties;
  onClose: () => void;
}) {
  const [data, setData] = useState<WorldProperties | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("All categories");
  const heading = useRef<HTMLHeadingElement>(null);
  const keys = data
    ? [
        ...new Set([
          ...Object.keys(data.defaults),
          ...Object.keys(data.overrides),
          ...Object.keys(overrides),
        ]),
      ]
        .sort()
        .filter(
          (key) =>
            (category === "All categories" ||
              propertyCategory(key) === category) &&
            key.includes(filter.trim().toLowerCase()),
        )
    : [];
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    setData(null);
    setError(null);
    void fetchWorldProperties(name, controller.signal).then(
      ([result, error]) => {
        if (controller.signal.aborted) return;
        if (error) setError(error.message);
        else {
          setData(result);
          setOverrides(result.overrides);
        }
      },
    );
    return () => controller.abort();
  }, [name, reload]);

  return (
    <form
      className="new-world-form property-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        if (data && (await onSave(name, overrides, data.revision))) onClose();
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        Properties for {name}
      </h3>
      <p className="hint">
        Customise properties for this world, or reset them to template defaults.
        Saving the selected world rebuilds its configuration without restarting.
        Restart Minecraft to apply changes. Seeds do not regenerate existing
        worlds. Level name is managed by world selection.
      </p>
      {data && !data.templateAvailable && (
        <p className="notice">
          The current configuration is the migration baseline. The next server
          update supplies an untouched vendor template.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading properties...</p>}
      <fieldset disabled={busy}>
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            Reload (discard edits)
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {data && (
          <>
            <label>
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>All categories</option>
                {PROPERTY_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Filter properties
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
              />
            </label>
            <div className="property-list">
              {!keys.length && <p role="status">No matching properties.</p>}
              {PROPERTY_CATEGORIES.map((group) => {
                const groupedKeys = keys.filter(
                  (key) => propertyCategory(key) === group,
                );
                if (!groupedKeys.length) return null;
                return (
                  <section key={group} aria-label={group}>
                    <h4>
                      {group} ({groupedKeys.length})
                    </h4>
                    {groupedKeys.map((key) => {
                      const customised = Object.hasOwn(overrides, key);
                      return (
                        <div className="property-row" key={key}>
                          <label>
                            {key}
                            <input
                              aria-label={key}
                              value={overrides[key] ?? data.defaults[key] ?? ""}
                              disabled={!customised}
                              maxLength={4096}
                              onChange={(event) =>
                                setOverrides({
                                  ...overrides,
                                  [key]: event.target.value,
                                })
                              }
                            />
                          </label>
                          <p className="hint">
                            Template:{" "}
                            {Object.hasOwn(data.defaults, key)
                              ? JSON.stringify(data.defaults[key])
                              : "not present (reset removes this property)"}
                          </p>
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => {
                              const next = { ...overrides };
                              if (customised) delete next[key];
                              else next[key] = data.defaults[key] ?? "";
                              setOverrides(next);
                            }}
                            aria-label={`${customised ? "Reset" : "Customise"} ${key}`}
                          >
                            {customised ? "Reset to default" : "Customise"}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
            <div className="actions">
              <button type="submit" className="button primary">
                Save properties
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setOverrides({})}
              >
                Reset all to template
              </button>
            </div>
            <p className="hint">
              Use Bedrock-supported values and ranges. Ports and authentication
              settings affect this server whenever this world is selected.
            </p>
          </>
        )}
      </fieldset>
    </form>
  );
}
