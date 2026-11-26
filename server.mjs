import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify as mockClassify } from "./mock-ai.mjs";
import { MODEL_TIMEOUT_MS, parseInput, triage } from "./triage.mjs";

const [html, uiScript] = await Promise.all([
  readFile(new URL("./index.html", import.meta.url)),
  readFile(new URL("./ui.mjs", import.meta.url)),
]);

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleTriage(request, response, options) {
  const text = parseInput(await readBody(request));
  if (text === null) return json(response, 400, { status: "invalid_input" });
  return json(response, 200, await triage(text, options));
}

/** Создаёт сервер. Модель, таймаут и логгер можно подменить в тестах. */
export function createApp({ classify = mockClassify, timeoutMs = MODEL_TIMEOUT_MS, log = console } = {}) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method === "GET" && request.url === "/ui.mjs") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(uiScript);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response, { classify, timeoutMs, log });
    } catch (error) {
      log.error("[server] unexpected error", error);
      json(response, 500, { status: "server_error" });
    }
  });
}

const startedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (startedDirectly) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, "127.0.0.1", () => {
    console.log(`Открыто на http://127.0.0.1:${port}`);
  });
}
