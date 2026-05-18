import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { Logger } from "tslog";

const TOKEN = randomUUID();

const UNRESTRICTED_PATHS = ["/api/auth/login", "/login.html", "/js/auth.js", "/line-icons/css/line-awesome.min.css"];
export function setUpAuthApi(app: Express) {
    const logger = new Logger({ name: "AuthApi" });
    app.post("/api/auth/login", (req, res) => {
        logger.debug("Received login request", req.body);
        const chuncks: Buffer[] = [];
        req.on("data", (chunk) => {
            logger.debug("Received login data chunk:", chunk.toString());
            chuncks.push(chunk);
        });
        req.on("end", () => {
            const data = Buffer.concat(chuncks).toString("utf-8");
            console.log("Complete login data:", data);
            const { username, password } = JSON.parse(data);

            logger.debug("Login attempt with username:", username);
            if (username === "test" && password === "dss*dsKM-ssdD0)-dscM11") {
                logger.debug("User logged in:", username);
                res.json({ token: TOKEN });
            } else {
                logger.warn("Failed login attempt:", username);
                res.status(401).json({ error: "Invalid credentials" });
            }
        });
    });

    app.use((req, res, next) => {
        if (UNRESTRICTED_PATHS.includes(req.path)) {
            next();
            return;
        }
        logger.debug("Authenticating request for path:", req.path);
        const token = getToken(req);
        logger.debug("Extracted token:", token);
        if (token === TOKEN) {
            next();
            return;
        }
        if (req.url.startsWith("/api/")) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        res.redirect("/login.html");
        return;
    });
}

function getToken(req: Request): string | null {
    const cookie = req.headers.cookie?.split(";").find(c => c.trim().startsWith("token="));

    return cookie ? cookie.split("=")[1] : null;
}