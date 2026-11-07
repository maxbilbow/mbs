import { createApp } from "./app.ts";

if (import.meta.main) {
  createApp().listen(8081, () => console.log("Server is running on port 8081"));
}
