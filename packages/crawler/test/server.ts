import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("./fixtures/site/", import.meta.url).pathname;

async function makeImage(color: string, w = 1200, h = 800) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="#00000033"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** Static fixture server on 127.0.0.1. Extensionless paths map to .html files. */
export async function startFixtureServer(): Promise<{ origin: string; server: Server; close: () => Promise<void> }> {
  const images: Record<string, Buffer> = {
    "/img/hero.jpg": await makeImage("#0b6e4f", 1600, 900),
    "/img/kok.jpg": await makeImage("#8a5a2b"),
    "/img/badrum.jpg": await makeImage("#2b5a8a"),
    "/img/tillbyggnad.jpg": await makeImage("#5a8a2b"),
  };
  let origin = "";
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (path === "/redirect-internal") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      return;
    }
    if (images[path]) {
      res.writeHead(200, { "content-type": "image/jpeg" }).end(images[path]);
      return;
    }
    const candidates = path === "/" ? ["index.html"] : [path.slice(1), `${path.slice(1)}.html`];
    for (const c of candidates) {
      const file = join(ROOT, c);
      if (file.startsWith(ROOT) && existsSync(file) && !file.endsWith("/")) {
        try {
          let body = readFileSync(file, "utf8");
          if (c.endsWith(".xml")) body = body.replaceAll("__ORIGIN__", origin);
          const type = c.endsWith(".xml") ? "application/xml" : c.endsWith(".txt") ? "text/plain" : "text/html; charset=utf-8";
          res.writeHead(200, { "content-type": type }).end(body);
          return;
        } catch {
          /* directory */
        }
      }
    }
    res.writeHead(404, { "content-type": "text/html" }).end("<h1>404</h1>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { origin, server, close: () => new Promise((r) => server.close(() => r())) };
}
