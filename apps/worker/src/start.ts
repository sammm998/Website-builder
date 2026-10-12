/**
 * Container entry point: applies pending database migrations (serialised by an advisory lock, so it is
 * safe alongside the web app's pre-deploy step), then starts the worker.
 */
import { migrate } from "@redesign/migrate";
import { main } from "./index";

const url = process.env["DATABASE_URL"];
if (url && process.env["SKIP_MIGRATIONS"] !== "1") {
  try {
    await migrate(url, { log: (m) => console.log(`[migrate] ${m}`) });
  } catch (error) {
    console.error("[migrate] failed:", error);
    process.exit(1);
  }
}
await main();
