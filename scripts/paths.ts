import { resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "..");
export const BEDROCK_ROOT = resolve(REPO_ROOT, "bedrock");
export const BEDROCK_EXECUTABLE = resolve(BEDROCK_ROOT, "bedrock_server");
export const VERSION_FILE = resolve(BEDROCK_ROOT, "current_version.txt");
