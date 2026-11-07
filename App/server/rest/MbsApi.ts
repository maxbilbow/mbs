import type { Express } from "express";
import * as MbsCtrl from "../mbs/MbsCtrl.ts";
import { Logger } from "tslog";
import { createMutationGate } from "./MutationGate.ts";

export function setUpMbsApi(
  app: Express,
  control = MbsCtrl,
  mutate = createMutationGate(),
) {
  const logger = new Logger({ name: "MbsApi" });
  app.get("/mbs/status", (req, res) => {
    const status = control.getStatus();
    logger.debug("Fetched server status:", status);
    res
      .status(200)
      .header("Content-Type", "application/json")
      .send(JSON.stringify(status));
  });

  app.post(
    "/mbs/start",
    mutate(async (req, res) => {
      await control.restart();
      logger.debug("Server started");
      res.status(200).send("Server Restarted");
    }),
  );
  app.post(
    "/mbs/stop",
    mutate(async (req, res) => {
      await control.stop();
      logger.debug("Server stopped");
      res.status(200).send("Server Stopped");
    }),
  );
}
