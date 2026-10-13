import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "../src/db";
import { loadEnv } from "../src/env";
import { createStorage } from "../src/storage";
import { startDatabase } from "./pg";

let db: Awaited<ReturnType<typeof startDatabase>>;
beforeAll(async () => {
  db = await startDatabase();
}, 60_000);
afterAll(async () => {
  await db?.stop();
});

describe("db storage (default on Railway)", () => {
  it("is chosen on Railway without a bucket and round-trips objects", async () => {
    const env = loadEnv({ DATABASE_URL: db.url, RAILWAY_ENVIRONMENT: "production", APP_ORIGIN: "https://web.example", AI_PROVIDER: "fake" });
    expect(env.STORAGE_DRIVER).toBe("db");
    const sql = connect(db.url);
    try {
      const storage = createStorage(env, sql);
      await storage.put("site-media", "p1/a.webp", Buffer.from("first"), "image/webp");
      await storage.put("site-media", "p1/a.webp", Buffer.from("second"), "image/webp");
      expect((await storage.get("site-media", "p1/a.webp")).toString()).toBe("second");
      await expect(storage.get("screens", "p1/missing.jpg")).rejects.toThrow(/not found/);
      await expect(storage.put("site-media", "../x", Buffer.from(""), "image/png")).rejects.toThrow();
      expect(storage.publicUrl("site-media", "p1/a.webp")).toBe("https://web.example/storage/site-media/p1/a.webp");
    } finally {
      await sql.end();
    }
  });
});

describe("worker without configuration", () => {
  let child: ChildProcess;
  afterAll(() => child?.kill("SIGTERM"));

  it("stays up and reports missing variables instead of crash-looping", async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    let log = "";
    child = spawn(process.execPath, ["--import", "tsx", "src/start.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { PATH: process.env["PATH"], RAILWAY_ENVIRONMENT: "production", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr!.on("data", (d) => (log += d));
    let body: { ok: boolean; missing: string[] } | null = null;
    for (let i = 0; i < 50 && !body; i++) {
      await new Promise((r) => setTimeout(r, 200));
      body = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json()).catch(() => null);
    }
    expect(child.exitCode).toBeNull();
    expect(body).toMatchObject({ ok: false, missing: expect.arrayContaining(["DATABASE_URL", "ANTHROPIC_API_KEY"]) });
    expect(log).toContain("waiting for configuration");
  }, 30_000);
});
