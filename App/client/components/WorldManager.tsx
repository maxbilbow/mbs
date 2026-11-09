import { useEffect, useRef, useState, type SubmitEvent } from "react";
import {
  DIFFICULTIES,
  GAME_MODES,
  type CreateWorldInput,
  type WorldList,
  type WorldSettings,
} from "../../model/Worlds.js";
import {
  WorldPropertyEditor,
  type SaveProperties,
} from "./WorldPropertyEditor.js";

export function WorldManager({
  data,
  busy,
  onSwitch,
  onCreate,
  onSaveProperties,
}: {
  data: WorldList | null;
  busy: boolean;
  onSwitch: (name: string) => void;
  onCreate: (input: CreateWorldInput, onSuccess: () => void) => void;
  onSaveProperties: SaveProperties;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const closeForm = () => {
    setCreating(false);
    createButton.current?.focus();
  };
  return (
    <section className="panel" aria-labelledby="worlds-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CHOOSE YOUR NEXT CHAPTER</p>
          <h2 id="worlds-title">
            Your worlds{" "}
            <span className="count">{data?.worlds.length ?? "..."}</span>
          </h2>
        </div>
        <button
          type="button"
          ref={createButton}
          className="button secondary"
          disabled={busy || creating || !data}
          onClick={() => setCreating(true)}
        >
          + New world
        </button>
      </div>
      <p className="section-description">
        Switch adventures without leaving the manager. Running servers restart
        when you switch.
      </p>
      {editing && (
        <WorldPropertyEditor
          key={editing}
          name={editing}
          busy={busy}
          onSave={onSaveProperties}
          onClose={() => {
            setEditing(null);
            editButton.current?.focus();
          }}
        />
      )}
      {creating && data && (
        <NewWorldForm
          defaults={data.defaults}
          busy={busy}
          onCancel={closeForm}
          onCreate={(input) => onCreate(input, closeForm)}
        />
      )}
      {!data ? (
        <p className="empty-state">Loading your worlds...</p>
      ) : (
        <div className="world-grid">
          {data.worlds.map((world) => (
            <article
              key={world.name}
              className={`world-card ${world.active ? "selected" : ""}`}
            >
              <div className="world-card-top">
                <span className="world-icon" aria-hidden="true" />
                <span className={`tag ${world.active ? "accent" : ""}`}>
                  {world.active ? "Selected" : "Available"}
                </span>
              </div>
              <h3>{world.name}</h3>
              <p className="world-generation">
                {world.generated ? "Generated world" : "Pending generation"}
              </p>
              <p className="world-settings">
                {world.settings
                  ? `${world.settings.gameMode} / ${world.settings.difficulty}`
                  : "Uses server defaults until settings are saved"}
              </p>
              <button
                type="button"
                className={`button ${world.active ? "ghost" : "secondary"}`}
                disabled={busy || world.active}
                onClick={() => onSwitch(world.name)}
                aria-label={
                  world.active
                    ? `${world.name} is selected`
                    : `Switch to ${world.name}`
                }
              >
                {world.active ? "Current world" : "Switch world"}
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                aria-label={`Edit properties for ${world.name}`}
                onClick={(event) => {
                  editButton.current = event.currentTarget;
                  setEditing(world.name);
                }}
              >
                Edit properties
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="hint">
        New worlds generate when selected and started. Existing worlds keep
        their data and pack assignments.
      </p>
    </section>
  );
}

function NewWorldForm({
  defaults,
  busy,
  onCancel,
  onCreate,
}: {
  defaults: WorldSettings;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: CreateWorldInput) => void;
}) {
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [gameMode, setGameMode] = useState(defaults.gameMode);
  const [difficulty, setDifficulty] = useState(defaults.difficulty);
  const [activate, setActivate] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({ name, seed, gameMode, difficulty, activate });
  }
  return (
    <form
      className="new-world-form"
      aria-labelledby="new-world-title"
      onSubmit={submit}
    >
      <h3 id="new-world-title">Start a new adventure</h3>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label htmlFor="world-name">
            World name
            <input
              ref={nameInput}
              id="world-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
              placeholder="e.g. Mountain Retreat"
              autoComplete="off"
              aria-describedby="world-name-help"
            />
          </label>
          <label htmlFor="world-seed">
            Seed <span className="optional">(optional)</span>
            <input
              id="world-seed"
              name="seed"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              maxLength={256}
              placeholder="Leave blank for a random world"
              autoComplete="off"
            />
          </label>
          <div>
            <label htmlFor="world-mode">Game mode</label>
            <select
              id="world-mode"
              name="gameMode"
              value={gameMode}
              onChange={(event) => {
                const mode = GAME_MODES.find(
                  (value) => value === event.target.value,
                );
                if (mode) setGameMode(mode);
              }}
            >
              {GAME_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="world-difficulty">Difficulty</label>
            <select
              id="world-difficulty"
              name="difficulty"
              value={difficulty}
              onChange={(event) => {
                const level = DIFFICULTIES.find(
                  (value) => value === event.target.value,
                );
                if (level) setDifficulty(level);
              }}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint" id="world-name-help">
          Use a unique name without filename symbols. Seed controls generation;
          game mode and difficulty use Bedrock's normal server settings.
        </p>
        <label className="checkbox-label" htmlFor="activate-world">
          <input
            id="activate-world"
            type="checkbox"
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
          />
          Select this world after creation
        </label>
        <p className="hint">
          Leave unchecked to save for later. Selecting restarts a running
          server, but leaves a stopped server stopped. Packs are not copied.
        </p>
        <div className="actions">
          <button type="submit" className="button primary">
            {activate ? "Create and select" : "Create world"}
          </button>
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
