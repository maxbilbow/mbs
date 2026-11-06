import { spawnSync } from "node:child_process";
import { createApp } from "./app.ts";
import { REPO_ROOT } from "../../scripts/paths.ts";

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
}

if (import.meta.main) {
  const outputPath = process.env.CADDY_OUTPUT_PATH;
  if (outputPath) {
    runCommand("npm", ["run", "build"]);
    runCommand("rsync", ["--delete", "-r", "./App/www/", outputPath]);
  }
  createApp().listen(8081, () => console.log("Server is running on port 8081"));
}
