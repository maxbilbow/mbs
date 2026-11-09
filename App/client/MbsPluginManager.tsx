import { useCallback, useEffect, useRef, useState } from "react";
import "./MbsPluginManager.css";
import type { PluginInfo } from "../model/Plugins.js";
import type { CreateWorldInput, WorldList } from "../model/Worlds.js";
import type { UserList } from "../model/Users.js";
import { fetchUsers, updateUser } from "./api/Users.js";
import { UserManager } from "./components/UserManager.js";
import {
  getServerStatus,
  startServer,
  stopServer,
  type ServerStatus,
} from "./api/MbsCtrl.js";
import {
  fetchPlugins,
  reorderPlugins,
  setPluginFavourite,
  togglePluginVersion,
} from "./api/Plugins.js";
import {
  activateWorld,
  createWorld,
  fetchWorlds,
  saveWorldProperties,
} from "./api/Worlds.js";
import type { ApiResult } from "./api/request.js";
import { PluginList } from "./PluginList/PluginList.js";
import { PluginUpdater } from "./PluginList/PluginUpdater.js";
import {
  ConfirmDialog,
  type Confirmation,
} from "./components/ConfirmDialog.js";
import { ServerPanel } from "./components/ServerPanel.js";
import { WorldManager } from "./components/WorldManager.js";
import { LogViewer } from "./components/LogViewer.js";

const tabs = ["Worlds", "Plugins", "Users", "Logs"] as const;

export function App() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Worlds");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [worlds, setWorlds] = useState<WorldList | null>(null);
  const [users, setUsers] = useState<UserList | null>(null);
  const [plugins, setPlugins] = useState<readonly PluginInfo[]>([]);
  const [showInactivePlugins, setShowInactivePlugins] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const mounted = useRef(false);
  const mutating = useRef(false);
  const requestId = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async (background = false) => {
    const id = ++requestId.current;
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    if (!background) setLoading(true);
    const [serverResult, worldResult, pluginResult, userResult] =
      await Promise.all([
        getServerStatus(controller.signal),
        fetchWorlds(controller.signal),
        fetchPlugins(controller.signal),
        fetchUsers(controller.signal),
      ]);
    if (!mounted.current || id !== requestId.current) return;
    const failures = [
      serverResult[1] && `Server: ${serverResult[1].message}`,
      worldResult[1] && `Worlds: ${worldResult[1].message}`,
      pluginResult[1] && `Packs: ${pluginResult[1].message}`,
      userResult[1] && `Users: ${userResult[1].message}`,
    ].filter(Boolean);
    if (serverResult[0]) setStatus(serverResult[0]);
    if (worldResult[0]) setWorlds(worldResult[0]);
    if (pluginResult[0]) setPlugins(pluginResult[0]);
    if (userResult[0]) setUsers(userResult[0]);
    setLoadError(failures.length ? failures.join(" ") : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!mutating.current) void refresh(true);
    }, 10_000);
    return () => {
      mounted.current = false;
      requestId.current++;
      currentRequest.current?.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function run(
    label: string,
    action: () => Promise<ApiResult<unknown>>,
    success: string,
  ) {
    if (mutating.current) return false;
    mutating.current = true;
    requestId.current++;
    currentRequest.current?.abort();
    setPending(label);
    setNotice(null);
    setConfirmation(null);
    try {
      const [, error] = await action();
      if (!mounted.current) return false;
      setNotice({ error: !!error, message: error?.message ?? success });
      await refresh();
      return !error;
    } finally {
      mutating.current = false;
      if (mounted.current) setPending(null);
    }
  }

  const busy = !!pending || loading || !!loadError;
  const running = status?.status === "active";

  function switchWorld(name: string) {
    setConfirmation({
      title: `Switch to ${name}?`,
      detail: running
        ? "Connected players will be disconnected. The server will stop, switch worlds, and restart. Pending worlds generate when Bedrock starts."
        : "The selected world will be configured, but the server will remain stopped. Pending worlds generate when you start the server.",
      confirmLabel: "Switch world",
      action: () =>
        run(
          "Switching worlds...",
          () => activateWorld(name),
          running
            ? `Switched to ${name}; server process started.`
            : `Selected ${name}; server remains stopped.`,
        ),
    });
  }

  function submitWorld(input: CreateWorldInput, onSuccess: () => void) {
    const action = async () => {
      const success = await run(
        "Creating world...",
        () => createWorld(input),
        input.activate
          ? `Created and selected ${input.name}.${running ? " Server process started; generation may still be in progress." : " Start the server to generate it."}`
          : `Created ${input.name}. Pending generation until selected and started.`,
      );
      if (success) onSuccess();
    };
    if (input.activate) {
      setConfirmation({
        title: `Create and select ${input.name}?`,
        detail: running
          ? "Connected players will be disconnected while the server stops and restarts to generate your new world. No packs are copied from the current world."
          : "Your new world will be selected. The server stays stopped until you start it to generate the world. No packs are copied.",
        confirmLabel: "Create and select",
        action,
      });
    } else {
      void action();
    }
  }

  return (
    <div className="dashboard">
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="MBS home">
          <span className="block-logo" aria-hidden="true">
            <span />
          </span>
          <span>
            MBS<span className="brand-subtitle">BEDROCK MANAGER</span>
          </span>
        </a>
        <span className="topbar-label">YOUR SERVER. YOUR WORLDS.</span>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="dashboard-title">
          <div>
            <p className="eyebrow">MISSION CONTROL</p>
            <h1 id="dashboard-title">A world of possibilities.</h1>
            <p className="hero-description">
              Manage your Bedrock server, explore your worlds, and make room for
              the next adventure.
            </p>
          </div>
          <div className="terrain" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
        <div className="feedback" aria-live="polite" aria-atomic="true">
          {pending && (
            <p className="notice progress">
              {pending} Please keep this page open.
            </p>
          )}
          {notice && (
            <p
              className={`notice ${notice.error ? "error" : "success"}`}
              role={notice.error ? "alert" : "status"}
            >
              {notice.message}
            </p>
          )}
        </div>
        {loadError && (
          <div className="notice error" role="alert">
            <p>
              Could not refresh the dashboard. Displayed information may be out
              of date. {loadError}
            </p>
            <button
              type="button"
              className="button secondary"
              disabled={!!pending || loading}
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        )}
        <ServerPanel
          status={status}
          activeWorld={worlds?.activeWorld}
          busy={busy}
          refreshing={loading}
          onRefresh={() => void refresh()}
          onStart={() => {
            if (!running) {
              void run(
                "Starting server...",
                startServer,
                "Server process started.",
              );
              return;
            }
            setConfirmation({
              title: "Restart the server?",
              detail:
                "Connected players will be disconnected while the server saves and restarts. This also applies pending pack changes.",
              confirmLabel: "Restart server",
              action: () =>
                run(
                  "Restarting server...",
                  startServer,
                  "Server process restarted.",
                ),
            });
          }}
          onStop={() =>
            setConfirmation({
              title: "Stop the server?",
              detail:
                "Connected players will be disconnected. Bedrock will save and shut down; you can start it again from this dashboard.",
              confirmLabel: "Stop server",
              action: () =>
                run("Stopping server...", stopServer, "Server stopped."),
            })
          }
        />
        <div className="config-tabs" role="tablist" aria-label="Manager areas">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`tab-${tab}`}
              aria-controls={`panel-${tab}`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className="button config-tab"
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                let next: number;
                switch (event.key) {
                  case "ArrowRight":
                    next = (index + 1) % tabs.length;
                    break;
                  case "ArrowLeft":
                    next = (index + tabs.length - 1) % tabs.length;
                    break;
                  case "Home":
                    next = 0;
                    break;
                  case "End":
                    next = tabs.length - 1;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                setActiveTab(tabs[next]);
                document.getElementById(`tab-${tabs[next]}`)?.focus();
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="panel-Worlds"
          aria-labelledby="tab-Worlds"
          hidden={activeTab !== "Worlds"}
          tabIndex={0}
        >
          <WorldManager
            data={worlds}
            busy={busy}
            onSwitch={switchWorld}
            onCreate={submitWorld}
            onSaveProperties={(name, overrides, revision) =>
              run(
                "Saving world properties...",
                () => saveWorldProperties(name, overrides, revision),
                `Properties saved for ${name}. Restart Minecraft to apply changes to the selected world.`,
              )
            }
          />
        </div>
        <div
          role="tabpanel"
          id="panel-Plugins"
          aria-labelledby="tab-Plugins"
          hidden={activeTab !== "Plugins"}
          tabIndex={0}
        >
          <PluginUpdater
            plugins={plugins}
            busy={busy}
            onRun={run}
            onConfirm={(preview, action) =>
              setConfirmation({
                title: "Install these packs?",
                detail: `${preview.packs.map((pack) => `${pack.name} v${pack.version.join(".")}`).join(", ")}. If Minecraft is running, connected players will be disconnected while it stops and restarts. Existing files and world pack selections are backed up. Same-version replacements affect every world using that version.`,
                confirmLabel: "Install packs",
                action,
              })
            }
          />
          <PluginList
            plugins={plugins}
            worldName={worlds?.activeWorld}
            busy={busy}
            loaded={!!worlds}
            showInactive={showInactivePlugins}
            onShowInactiveChange={setShowInactivePlugins}
            onReorder={(uuids) =>
              void run(
                "Saving plugin load order...",
                () => reorderPlugins(uuids),
                "Plugin load order saved. Restart the server to apply it.",
              )
            }
            onFavourite={(uuids, favourite) =>
              void run(
                "Saving favourite...",
                () => setPluginFavourite(uuids, favourite),
                "Plugin favourite saved.",
              )
            }
            onToggle={(uuid, version) =>
              void run(
                "Updating pack...",
                () => togglePluginVersion(uuid, version),
                "Pack selection saved. Restart the server to apply pack changes.",
              )
            }
          />
        </div>
        <div
          role="tabpanel"
          id="panel-Users"
          aria-labelledby="tab-Users"
          hidden={activeTab !== "Users"}
          tabIndex={0}
        >
          <UserManager
            data={users}
            busy={busy}
            onSave={(input, onSuccess) => {
              void run(
                "Saving user...",
                () => updateUser(input),
                "User saved. Permissions apply on the next server start/restart or world switch.",
              ).then((success) => {
                if (success) onSuccess();
              });
            }}
          />
        </div>
        <div
          role="tabpanel"
          id="panel-Logs"
          aria-labelledby="tab-Logs"
          hidden={activeTab !== "Logs"}
          tabIndex={0}
        >
          <LogViewer active={activeTab === "Logs"} />
        </div>
      </main>
      <footer className="footer">
        <span>MBS / Minecraft Bedrock</span>
        <span>Build something worth exploring.</span>
      </footer>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}
