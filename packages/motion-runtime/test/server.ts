import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const DEMO = new URL("../demo/", import.meta.url).pathname;
const TYPES: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8" };

export async function startDemoServer() {
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    if (url === "/favicon.ico") return void res.writeHead(204).end();
    const file = url.startsWith("/runtime/") ? join(DIST, url.slice("/runtime/".length)) : join(DEMO, url === "/" ? "index.html" : url);
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  return { origin: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
