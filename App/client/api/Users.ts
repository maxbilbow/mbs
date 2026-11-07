import type { UpdateUserInput, UserList } from "../../model/Users.js";
import { jsonBody, requestJson } from "./request.js";

export function fetchUsers(signal?: AbortSignal) {
  return requestJson<UserList>("/users", { signal });
}

export function updateUser(input: UpdateUserInput) {
  return requestJson<UserList>("/users", { ...jsonBody(input), method: "PUT" });
}
