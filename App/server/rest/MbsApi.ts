import type { Express } from "express";
import * as MbsCtrl from "../mbs/MbsCtrl.ts";
import { Logger } from "tslog";

export function setUpMbsApi(app: Express) {
    const logger = new Logger({ name: "MbsApi"});
    app.get("/mbs/status", (req, res) => {
        const status = MbsCtrl.getStatus();
        logger.debug("Fetched server status:", status);
        res.status(200).header("Content-Type", "application/json").send(JSON.stringify(status));
    });

    app.post("/mbs/start", async (req, res) => {
        await MbsCtrl.restart();
        logger.debug("Server started");
        res.status(200).send("Server Restarted");
    });
    app.post("/mbs/stop", (req, res) => {
        MbsCtrl.stop();
        logger.debug("Server stopped");
        res.status(200).send("Server Stopped");
    });
}