import { update } from "./scripts/update-server.ts";

if (import.meta.main)
  await update({ checkOnly: process.argv.includes("--check") });
