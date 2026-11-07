import { useEffect, useRef, useState, type SubmitEvent } from "react";
import type { PluginInfo } from "../../model/Plugins.js";
import type {
  PluginInstallPreview,
  PluginSource,
  PluginSourceInput,
  PluginUpdateCheck,
  PluginUpdateList,
} from "../../model/PluginUpdates.js";
import type { ApiResult } from "../api/request.js";
import {
  cancelPluginPreview,
  checkPluginUpdates,
  fetchPluginSources,
  importPluginArchive,
  installPluginPreview,
  removePluginSource,
  savePluginSource,
  stagePluginUpdate,
} from "../api/PluginUpdates.js";

export function PluginUpdater({
  plugins,
  busy,
  onRun,
  onConfirm,
}: {
  plugins: readonly PluginInfo[];
  busy: boolean;
  onRun: (
    label: string,
    action: () => Promise<ApiResult<unknown>>,
    success: string,
  ) => Promise<boolean>;
  onConfirm: (
    preview: PluginInstallPreview,
    action: () => Promise<unknown>,
  ) => void;
}) {
  const [data, setData] = useState<PluginUpdateList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<PluginUpdateCheck[] | null>(null);
  const [editing, setEditing] = useState<PluginSource | "new" | null>(null);
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const mounted = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const [importSource, setImportSource] = useState("");
  const [importRelease, setImportRelease] = useState("");

  async function load(signal?: AbortSignal) {
    const [result, error] = await fetchPluginSources(signal);
    if (!mounted.current || signal?.aborted) return;
    setData(result);
    setError(error?.message ?? null);
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  const disabled = busy || !data;
  const sourceNames = (source: PluginSource) =>
    source.uuids
      .map(
        (uuid) =>
          plugins.find((plugin) => plugin.uuid.toLowerCase() === uuid)?.name ??
          uuid,
      )
      .join(" + ");

  async function save(input: PluginSourceInput) {
    await onRun(
      "Saving plugin source...",
      async () => {
        const result = await savePluginSource(
          input,
          editing && editing !== "new" ? editing.id : undefined,
        );
        if (result[0] && mounted.current) {
          setData(result[0]);
          setChecks(null);
          setEditing(null);
        }
        return result;
      },
      "Plugin source saved.",
    );
  }

  async function inspect() {
    const file = upload.current?.files?.[0];
    if (!file) return;
    await onRun(
      "Inspecting plugin archive...",
      async () => {
        if (file.size > 64 * 1024 * 1024)
          return [
            null,
            new Error("Archive exceeds the 64 MiB upload limit."),
          ] as const;
        const result = await importPluginArchive(
          file,
          importSource || undefined,
          importRelease.trim() || undefined,
        );
        if (result[0] && mounted.current) setPreview(result[0]);
        return result;
      },
      "Archive inspected. Review the packs before installing.",
    );
  }

  async function install() {
    if (!preview) return;
    await onRun(
      "Installing plugins...",
      async () => {
        const result = await installPluginPreview(preview.token);
        if (mounted.current) {
          setPreview(null);
          setChecks(null);
          await load();
        }
        return result;
      },
      "Packs installed and backed up. The previous server running state was restored. New/inactive packs remain inactive.",
    );
  }

  return (
    <section
      className="panel plugin-updater"
      aria-labelledby="plugin-updates-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">KEEP YOUR PACKS CURRENT</p>
          <h2 id="plugin-updates-title">Plugin updates</h2>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={disabled || !!preview || !!editing}
            onClick={() => setEditing("new")}
          >
            Link source
          </button>
          <button
            type="button"
            className="button primary"
            disabled={disabled || !data?.sources.length || !!preview}
            onClick={() =>
              void onRun(
                "Checking plugin updates...",
                async () => {
                  const result = await checkPluginUpdates();
                  if (result[0] && mounted.current) setChecks(result[0]);
                  return result;
                },
                "Update check completed. Review the results below.",
              )
            }
          >
            Check for updates
          </button>
        </div>
      </div>
      <p className="section-description">
        Link each project to its installed packs once. Unlinked packs cannot be
        checked automatically. Stable releases only; compatibility still needs
        an in-game check.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Retry sources
          </button>
        </div>
      )}
      {!data && !error && <p>Loading update sources...</p>}
      {data && !data.curseforgeConfigured && (
        <p className="hint">
          CurseForge checks need an approved API key in the server&apos;s
          CURSEFORGE_API_KEY environment variable. Never enter the key in this
          page.{" "}
          <a
            href="https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api"
            target="_blank"
            rel="noreferrer"
          >
            Apply for a key
          </a>
          , or download packs manually and import them below.
        </p>
      )}
      {editing && (
        <SourceForm
          key={editing === "new" ? "new" : editing.id}
          source={editing === "new" ? undefined : editing}
          plugins={plugins}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(input) => void save(input)}
        />
      )}
      {data?.sources.map((source) => {
        const check = checks?.find((check) => check.sourceId === source.id);
        return (
          <article className="user-card" key={source.id}>
            <h3>{sourceNames(source)}</h3>
            <p>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.provider === "curseforge" ? "CurseForge" : "GitHub"}{" "}
                project
              </a>{" "}
              &middot; Installed release: {source.installedRelease ?? "Unknown"}
            </p>
            {check && (
              <p
                role={check.status === "error" ? "alert" : "status"}
                className={check.status === "error" ? "notice error" : ""}
              >
                {check.message}
              </p>
            )}
            {check?.release && (
              <p>
                <a href={check.release.url} target="_blank" rel="noreferrer">
                  {check.release.name}
                </a>
                {!check.release.downloadUrl &&
                  " — Download manually, or select an exact archive filename when a GitHub release has multiple assets."}
              </p>
            )}
            <div className="actions">
              {check?.release?.downloadUrl && check.status !== "current" && (
                <button
                  type="button"
                  className="button primary"
                  disabled={disabled || !!preview}
                  onClick={() =>
                    void onRun(
                      "Downloading and inspecting update...",
                      async () => {
                        const result = await stagePluginUpdate(
                          source.id,
                          check.release!.id,
                        );
                        if (result[0] && mounted.current) setPreview(result[0]);
                        return result;
                      },
                      "Update downloaded. Review the packs before installing.",
                    )
                  }
                >
                  {check.status === "unknown"
                    ? "Inspect latest release"
                    : "Update"}
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={disabled || !!preview}
                onClick={() => setEditing(source)}
              >
                Edit source
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={disabled || !!preview}
                onClick={() =>
                  void onRun(
                    "Removing source link...",
                    async () => {
                      const result = await removePluginSource(source.id);
                      if (result[0] && mounted.current) {
                        setData(result[0]);
                        setChecks(null);
                        if (importSource === source.id) {
                          setImportSource("");
                          setImportRelease("");
                        }
                      }
                      return result;
                    },
                    "Source link removed. Installed packs were not changed.",
                  )
                }
              >
                Unlink
              </button>
            </div>
          </article>
        );
      })}
      {data && !data.sources.length && (
        <p className="empty-state">
          No sources linked. Link installed packs, or import a pack first.
        </p>
      )}
      <form
        className="new-world-form plugin-import"
        onSubmit={(event) => {
          event.preventDefault();
          void inspect();
        }}
      >
        <fieldset disabled={disabled || !!preview}>
          <legend>Import a downloaded pack</legend>
          <p className="hint">
            For other websites or restricted downloads. Supports .mcpack,
            .mcaddon, and ZIP, including nested pack archives. Maximum upload:
            64 MiB.
          </p>
          <div className="form-grid">
            <label>
              Archive
              <input
                ref={upload}
                type="file"
                accept=".mcpack,.mcaddon,.zip"
                required
              />
            </label>
            <label>
              Source association <span className="optional">(optional)</span>
              <select
                value={importSource}
                onChange={(event) => {
                  setImportSource(event.target.value);
                  setImportRelease("");
                }}
              >
                <option value="">New/untracked import</option>
                {data?.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {sourceNames(source)}
                  </option>
                ))}
              </select>
            </label>
            {importSource && (
              <label>
                Downloaded upstream release ID{" "}
                <span className="optional">(optional)</span>
                <input
                  value={importRelease}
                  maxLength={200}
                  onChange={(event) => setImportRelease(event.target.value)}
                  placeholder="CurseForge file ID or GitHub tag"
                />
                <span className="hint">
                  Only set this if you know which release you downloaded;
                  otherwise tracking becomes unknown.
                </span>
              </label>
            )}
          </div>
          <div className="actions">
            <button className="button secondary" type="submit">
              Inspect archive
            </button>
          </div>
        </fieldset>
      </form>
      {preview && (
        <article className="user-card" aria-labelledby="install-preview-title">
          <h3 id="install-preview-title">
            Review installation
            {preview.release ? `: ${preview.release.name}` : ""}
          </h3>
          <ul>
            {preview.packs.map((pack) => (
              <li key={pack.uuid}>
                {pack.name} &middot; {pack.type} &middot; v
                {pack.version.join(".")}
                {pack.activates
                  ? " — updates the active selection"
                  : " — installed inactive"}
                {pack.replacesSameVersion
                  ? " — replaces existing files for this version"
                  : ""}
                <span className="plugin-uuid">{pack.uuid}</span>
              </li>
            ))}
          </ul>
          {preview.warnings.map((warning) => (
            <p className="hint" key={warning}>
              {warning}
            </p>
          ))}
          <p className="hint">
            Preview expires at{" "}
            {new Date(preview.expiresAt).toLocaleTimeString()}.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => onConfirm(preview, install)}
            >
              Install packs
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void onRun(
                  "Cancelling preview...",
                  async () => {
                    const result = await cancelPluginPreview(preview.token);
                    if (
                      mounted.current &&
                      (!result[1] ||
                        Date.parse(preview.expiresAt) <= Date.now())
                    )
                      setPreview(null);
                    return result;
                  },
                  "Staged files removed; installed packs were not changed.",
                )
              }
            >
              Cancel preview
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

function SourceForm({
  source,
  plugins,
  busy,
  onCancel,
  onSave,
}: {
  source?: PluginSource;
  plugins: readonly PluginInfo[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: PluginSourceInput) => void;
}) {
  const [provider, setProvider] = useState<PluginSourceInput["provider"]>(
    source?.provider ?? "curseforge",
  );
  const [url, setUrl] = useState(source?.url ?? "");
  const [projectId, setProjectId] = useState(
    source?.projectId?.toString() ?? "",
  );
  const [assetName, setAssetName] = useState(source?.assetName ?? "");
  const [installedRelease, setInstalledRelease] = useState(
    source?.installedRelease ?? "",
  );
  const [uuids, setUuids] = useState(source?.uuids ?? []);
  const [error, setError] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uuids.length) {
      setError("Select at least one installed pack.");
      return;
    }
    setError(null);
    onSave({
      provider,
      url: url.trim(),
      uuids,
      ...(provider === "curseforge" ? { projectId: Number(projectId) } : {}),
      ...(assetName.trim() ? { assetName: assetName.trim() } : {}),
      ...(installedRelease.trim()
        ? { installedRelease: installedRelease.trim() }
        : {}),
    });
  }
  return (
    <form className="new-world-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>{source ? "Edit plugin source" : "Link plugin source"}</legend>
        <div className="form-grid">
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) =>
                setProvider(
                  event.target.value === "github" ? "github" : "curseforge",
                )
              }
            >
              <option value="curseforge">CurseForge</option>
              <option value="github">GitHub releases</option>
            </select>
          </label>
          <label>
            Project URL
            <input
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={
                provider === "curseforge"
                  ? "https://www.curseforge.com/minecraft-bedrock/addons/..."
                  : "https://github.com/owner/repository"
              }
            />
          </label>
          {provider === "curseforge" && (
            <label>
              CurseForge project ID
              <input
                type="number"
                required
                min="1"
                step="1"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              />
              <span className="hint">
                The numeric project ID shown on CurseForge, not the pack UUID.
              </span>
            </label>
          )}
          <label>
            Exact archive filename <span className="optional">(optional)</span>
            <input
              maxLength={200}
              value={assetName}
              onChange={(event) => setAssetName(event.target.value)}
              placeholder="Choose one asset when a release has multiple archives"
            />
          </label>
          <label>
            Installed upstream release{" "}
            <span className="optional">(optional)</span>
            <input
              maxLength={200}
              value={installedRelease}
              onChange={(event) => setInstalledRelease(event.target.value)}
              placeholder={
                provider === "curseforge"
                  ? "CurseForge file ID, not the manifest version"
                  : "GitHub release tag, e.g. v1.2.0"
              }
            />
          </label>
        </div>
        <p className="hint">
          Select every behaviour/resource companion supplied by this project.
          Names may differ; verify UUIDs. Updates must contain exactly these
          packs. Leave the installed release blank if unknown.
        </p>
        <div className="plugin-source-packs">
          {plugins.map((plugin) => {
            const uuid = plugin.uuid.toLowerCase();
            return (
              <label className="checkbox-label" key={uuid}>
                <input
                  type="checkbox"
                  checked={uuids.includes(uuid)}
                  disabled={!/^[0-9a-f-]{36}$/i.test(uuid)}
                  onChange={(event) =>
                    setUuids(
                      event.target.checked
                        ? [...uuids, uuid]
                        : uuids.filter((id) => id !== uuid),
                    )
                  }
                />
                <span>
                  {plugin.name} ({plugin.type})
                  <span className="plugin-uuid">{uuid}</span>
                </span>
              </label>
            );
          })}
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="button primary">
            Save source
          </button>
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
