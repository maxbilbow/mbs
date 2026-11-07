import type { Express } from "express";
import type { createUserStore } from "../data/Users.ts";
import type { createWorldStore } from "../data/Worlds.ts";
import { createMutationGate } from "./MutationGate.ts";

export function setUpUsersApi(
  app: Express,
  users: ReturnType<typeof createUserStore>,
  worlds: ReturnType<typeof createWorldStore>,
  mutate = createMutationGate(),
) {
  const names = () => worlds.list().worlds.map((world) => world.name);
  app.get(
    "/users",
    mutate((_req, res) => {
      res.json(users.list(names()));
    }),
  );
  app.put(
    "/users",
    mutate((req, res) => {
      res.json(users.update(req.body, names()));
    }),
  );
}
