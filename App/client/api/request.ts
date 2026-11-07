import { BASE_URL } from "./config.js";

export type ApiResult<T> = readonly [T, null] | readonly [null, Error];

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  read: (response: Response) => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, init);
    if (!response.ok) {
      const body: unknown = await response.json().catch((error: unknown) => {
        throw new Error(
          `Request failed (HTTP ${response.status}). The server returned an unreadable error response.`,
          { cause: error },
        );
      });
      const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : `Request failed (HTTP ${response.status}).`;
      return [null, new Error(message)];
    }
    return [await read(response), null];
  } catch (error) {
    return [
      null,
      error instanceof Error
        ? error
        : new Error("Unable to contact the server."),
    ];
  }
}

export function requestJson<T>(path: string, init?: RequestInit) {
  return request<T>(
    path,
    init,
    async (response) => (await response.json()) as T,
  );
}

export function requestText(path: string, init?: RequestInit) {
  return request(path, init, (response) => response.text());
}

export function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}
