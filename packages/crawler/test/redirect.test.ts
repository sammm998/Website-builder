import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initCrawl, resolveStartUrl } from "../src/index";

// "dinsajt.se" -> "https://www.dinsajt.se/sv": simulated with localhost redirecting to 127.0.0.1.
let server: Server;
let port = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.headers.host?.startsWith("localhost")) return void res.writeHead(301, { location: `http://127.0.0.1:${port}/sv` }).end();
    if (req.url === "/sv") return void res.writeHead(200, { "content-type": "text/html" }).end("<h1>Hej</h1><a href='/sv/om'>Om</a>");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});
afterAll(() => server.close());

describe("start URL redirects", () => {
  it("crawls from the final URL so the site's real origin is used", async () => {
    // localhost resolves to 127.0.0.1 as well; the server tells them apart by Host header.
    expect(await resolveStartUrl(`http://localhost:${port}/`, { allowPrivate: true })).toBe(`http://127.0.0.1:${port}/sv`);
    const state = await initCrawl(`http://localhost:${port}/`, { allowPrivate: true });
    expect(new URL(state.start).origin).toBe(`http://127.0.0.1:${port}`);
    expect(state.start).toBe(`http://127.0.0.1:${port}/sv`);
  });

  it("falls back to the input when the site cannot be fetched", async () => {
    expect(await resolveStartUrl(`http://127.0.0.1:${port}/missing`, { allowPrivate: true })).toBe(`http://127.0.0.1:${port}/missing`);
    expect(await resolveStartUrl("http://127.0.0.1:1/", { allowPrivate: true, timeoutMs: 2000 } as never)).toBe("http://127.0.0.1:1/");
  });
});
