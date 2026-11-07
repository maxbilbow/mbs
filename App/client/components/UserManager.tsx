import { useState, type SubmitEvent } from "react";
import {
  PERMISSIONS,
  type Permission,
  type UpdateUserInput,
  type UserInfo,
  type UserList,
} from "../../model/Users.js";

export function UserManager({
  data,
  busy,
  onSave,
}: {
  data: UserList | null;
  busy: boolean;
  onSave: (input: UpdateUserInput, onSuccess: () => void) => void;
}) {
  const [selectedWorld, setSelectedWorld] = useState("");
  const [adding, setAdding] = useState(false);
  const world = data?.worlds.includes(selectedWorld)
    ? selectedWorld
    : (data?.activeWorld ?? "");
  return (
    <section className="panel" aria-labelledby="users-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR ADVENTURERS</p>
          <h2 id="users-title">
            Users <span className="count">{data?.users.length ?? "..."}</span>
          </h2>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy || adding || !data}
          onClick={() => setAdding(true)}
        >
          + Add user
        </button>
      </div>
      <p className="section-description">
        Players are discovered from permissions, the allowlist, and connection
        logs. Aliases are yours to choose; usernames are learned locally.
      </p>
      <label htmlFor="users-world">
        Permissions for world
        <select
          id="users-world"
          value={world}
          disabled={busy || !data}
          onChange={(event) => setSelectedWorld(event.target.value)}
        >
          {data?.worlds.map((name) => (
            <option key={name} value={name}>
              {name}
              {name === data.activeWorld ? " (selected)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Unassigned users inherit the server default (
        {data?.defaultPermission ?? "..."}). Saving does not restart Minecraft.
        Active-world changes apply on the next start/restart; other assignments
        apply when you switch to that world. Operator grants administrative
        commands in Minecraft, not manager access.
      </p>
      {adding && data && (
        <UserEditor
          key={`new-${world}`}
          world={world}
          busy={busy}
          onSave={(input, done) =>
            onSave(input, () => {
              done();
              setAdding(false);
            })
          }
          onCancel={() => setAdding(false)}
        />
      )}
      {!data ? (
        <p className="empty-state">Loading users...</p>
      ) : data.users.length === 0 ? (
        <p className="empty-state">
          No known users yet. Join the server or add a user by XUID.
        </p>
      ) : (
        <div className="user-list">
          {data.users.map((user) => (
            <UserEditor
              key={`${user.xuid}-${world}`}
              user={user}
              world={world}
              busy={busy}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function UserEditor({
  user,
  world,
  busy,
  onSave,
  onCancel,
}: {
  user?: UserInfo;
  world: string;
  busy: boolean;
  onSave: (input: UpdateUserInput, onSuccess: () => void) => void;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(!user);
  const [xuid, setXuid] = useState(user?.xuid ?? "");
  const [alias, setAlias] = useState(user?.alias ?? "");
  const assigned =
    user && Object.hasOwn(user.permissions, world)
      ? user.permissions[world]
      : null;
  const [permission, setPermission] = useState<Permission | null>(assigned);

  function beginEdit() {
    setAlias(user?.alias ?? "");
    setPermission(assigned);
    setEditing(true);
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ xuid, alias: alias.trim(), world, permission }, () =>
      setEditing(false),
    );
  }

  return (
    <article className="user-card">
      <h3>
        {user
          ? user.alias || user.username || "Unknown player"
          : "Add a player"}
      </h3>
      {user && (
        <>
          <p className="hint user-identity">
            Username: {user.username ?? "Not discovered"} / XUID: {user.xuid}
          </p>
          <p className="hint">
            Permission in {world}: {assigned ?? "Server default"}
          </p>
        </>
      )}
      {!editing ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={beginEdit}
        >
          Edit {user?.alias || user?.username || user?.xuid}
        </button>
      ) : (
        <form
          onSubmit={submit}
          aria-label={`Edit player ${user?.xuid ?? "details"}`}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
              {!user && (
                <label>
                  XUID
                  <input
                    value={xuid}
                    onChange={(event) => setXuid(event.target.value)}
                    required
                    pattern="[1-9][0-9]{0,19}"
                    maxLength={20}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </label>
              )}
              <label>
                Alias <span className="optional">(optional)</span>
                <input
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <label>
                Permission in {world}
                <select
                  value={permission ?? ""}
                  onChange={(event) =>
                    setPermission(
                      PERMISSIONS.find((role) => role === event.target.value) ??
                        null,
                    )
                  }
                >
                  <option value="">Server default</option>
                  {PERMISSIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="actions">
              <button type="submit" className="button primary">
                Save user
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  setEditing(false);
                  onCancel?.();
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </article>
  );
}
