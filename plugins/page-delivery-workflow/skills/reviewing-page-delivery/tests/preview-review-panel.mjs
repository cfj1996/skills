import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const previewPath = "/tests/fixtures/panel-preview.html";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const reloadClients = new Set();
const watchedFiles = [
  "scripts/inject-review-panel.js",
  "tests/fixtures/panel-preview.html",
  "tests/fixtures/review-session.json",
].map((path) => resolve(skillRoot, path));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

function broadcastReload() {
  for (const response of reloadClients) response.write("data: reload\n\n");
}

for (const file of watchedFiles) {
  watch(file, { persistent: false }, broadcastReload);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/") {
    response.writeHead(302, { location: previewPath });
    response.end();
    return;
  }
  if (requestUrl.pathname === "/__reload") {
    response.writeHead(200, {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    response.write(": connected\n\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }

  const requestedPath = resolve(skillRoot, `.${decodeURIComponent(requestUrl.pathname)}`);
  if (!requestedPath.startsWith(`${skillRoot}/`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await stat(requestedPath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(requestedPath)] || "application/octet-stream",
    });
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Review panel preview: http://127.0.0.1:${port}${previewPath}`);
});

function shutdown() {
  for (const response of reloadClients) response.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
