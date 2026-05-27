
// Start express server
import express from "express";
import { setUpPluginsApi } from "./rest/PluginsApi.ts";
import path from "node:path";
import { setUpMbsApi } from "./rest/MbsApi.ts";
import { spawn, spawnSync } from "node:child_process";
import { setUpAuthApi } from "./rest/AuthApi.ts";

const DEV_MODE = process.argv.includes("--dev");

const app = express();
const PORT = 8081;


if (import.meta.main) {
    app.use(express.json());
    setUpAuthApi(app);
    useCors(app);
    setUpPluginsApi(app);
    setUpMbsApi(app);

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });

    app.use(express.static(path.join(import.meta.dirname, "../www"), {
        index: "index.html",
    }));

    spawn("esbuild", [
        "./App/client/main.tsx",
        "./App/client/auth.ts",
        "--bundle",
        "--outdir=./App/www/js",
        "--loader:.css=global-css",
    ], {
        stdio: "inherit",
    });

    // spawn("esbuild", [
    //     "./App/client/main.tsx",
    //     "--bundle",
    //     "--serve=8080",
    //     "--servedir=./App/www",
    //     "--outdir=./App/www/js",
    //     "--loader:.css=global-css",
    //     "--watch"
    // ], {
    //     stdio: "inherit",
    // });
}

function useCors(app: express.Express) {
    // List of allowed origins
    const allowedOrigins = [
        'http://192.168.0.18:8080',
        'http://max.hopto.org',
        'https://max.hopto.org',
        'http://mbs.maxbilbow.com',
        'https://mbs.maxbilbow.com',
    ];

    // CORS middleware
    app.use((req, res, next) => {
        const { origin } = req.headers;

        // Validate origin
        if (allowedOrigins.includes(origin!)) {
            res.header("Access-Control-Allow-Origin", origin);
            res.header("Vary", "Origin");
            res.header("Access-Control-Allow-Credentials", "true");
        }

        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

        // Handle preflight
        if (req.method === 'OPTIONS') {
            res.header("Access-Control-Max-Age", "86400");
            return res.sendStatus(204);
        }

        next();
    });
}