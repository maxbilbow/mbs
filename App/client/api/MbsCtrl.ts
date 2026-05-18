import { BASE_URL } from "./config.js";

export async function getServerStatus() {
    const response = await fetch(`${BASE_URL}/mbs/status`);

    if (!response.ok) {
        return [null, new Error(`Failed to fetch server status: ${response.statusText}`)] as const;
    }
    return [await response.json() as { version: string; status: string }, null] as const;
}

export async function startServer() {
    const response = await fetch(`${BASE_URL}/mbs/start`, {
        method: "POST",
    });

    if (!response.ok) {
        return [null, new Error(`Failed to start server: ${response.statusText}`)] as const;
    }
    return [await response.text(), null] as const;
}

export async function stopServer() {
    const response = await fetch(`${BASE_URL}/mbs/stop`, {
        method: "POST",
    });

    if (!response.ok) {
        return [null, new Error(`Failed to stop server: ${response.statusText}`)] as const;
    }
    return [await response.text(), null] as const;
}