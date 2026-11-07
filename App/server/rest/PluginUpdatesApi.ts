import express, { type Express } from "express";
import { createPluginUpdateStore } from "../data/PluginUpdates.ts";
import { MAX_DOWNLOAD, PluginUpdateError } from "../data/PluginSources.ts";
import { createMutationGate } from "./MutationGate.ts";

export function setUpPluginUpdatesApi(
  app: Express,
  store = createPluginUpdateStore(),
  mutate = createMutationGate(),
) {
  app.get("/plugins/updates", (_req, res) => res.json(store.list()));
  app.post(
    "/plugins/updates/sources",
    mutate((req, res) => {
      res.status(201).json(store.link(req.body));
    }),
  );
  app.put(
    "/plugins/updates/sources/:id",
    mutate((req, res) => {
      res.json(store.link(req.body, String(req.params.id)));
    }),
  );
  app.delete(
    "/plugins/updates/sources/:id",
    mutate((req, res) => {
      res.json(store.unlink(String(req.params.id)));
    }),
  );
  app.post(
    "/plugins/updates/check",
    mutate(async (_req, res) => {
      res.json(await store.check());
    }),
  );
  app.post(
    "/plugins/updates/sources/:id/stage",
    mutate(async (req, res) => {
      res.json(
        await store.stageUpdate(String(req.params.id), req.body?.releaseId),
      );
    }),
  );
  app.post(
    "/plugins/updates/import",
    express.raw({ type: "application/octet-stream", limit: MAX_DOWNLOAD }),
    mutate(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new PluginUpdateError(
          "Upload a nonempty archive with application/octet-stream content type.",
        );
      const sourceId = req.query.sourceId;
      const releaseId = req.query.releaseId;
      if (
        (sourceId !== undefined && typeof sourceId !== "string") ||
        (releaseId !== undefined && typeof releaseId !== "string")
      )
        throw new PluginUpdateError("Invalid source or release ID.");
      res.json(await store.importArchive(req.body, sourceId, releaseId));
    }),
  );
  app.delete(
    "/plugins/updates/stages/:token",
    mutate((req, res) => {
      store.cancel(String(req.params.token));
      res.json({ success: true });
    }),
  );
  app.post(
    "/plugins/updates/stages/:token/install",
    mutate(async (req, res) => {
      res.json(
        await store.install(String(req.params.token), req.body?.confirmed),
      );
    }),
  );
}
