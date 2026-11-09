import type { Express } from "express";
import { createWorldStore } from "../data/Worlds.ts";
import { validateWorldName } from "../data/WorldProperties.ts";
import { createMutationGate } from "./MutationGate.ts";

export function setUpWorldsApi(
  app: Express,
  store = createWorldStore(),
  mutate = createMutationGate(),
) {
  app.get("/worlds", (_req, res) => {
    res.json(store.list());
  });

  app.post(
    "/worlds",
    mutate(async (req, res) => {
      res.status(201).json(await store.create(req.body));
    }),
  );

  app.post(
    "/worlds/activate",
    mutate(async (req, res) => {
      const name: unknown = req.body?.name;
      validateWorldName(name);
      res.json(await store.activate(name));
    }),
  );

  app.get("/worlds/properties", (req, res) => {
    const name: unknown = req.query.name;
    validateWorldName(name);
    res.json(store.getProperties(name));
  });

  app.put(
    "/worlds/properties",
    mutate(async (req, res) => {
      const name: unknown = req.body?.name;
      validateWorldName(name);
      res.json(store.saveProperties(name, req.body));
    }),
  );
}
