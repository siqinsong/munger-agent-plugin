import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const promptPath = path.join(__dirname, "prompts", "munger-system-prompt.txt");
const isProduction = process.env.NODE_ENV === "production";

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  return readFile(envPath, "utf8")
    .then((content) => {
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }

        const equalsIndex = line.indexOf("=");
        if (equalsIndex === -1) {
          continue;
        }

        const key = line.slice(0, equalsIndex).trim();
        const value = line.slice(equalsIndex + 1).trim();

        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    })
    .catch(() => {});
}

await loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let promptCache = null;

async function getSystemPrompt() {
  if (!promptCache) {
    promptCache = await readFile(promptPath, "utf8");
  }
  return promptCache;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Cache-Control": "no-store"
  });
  res.end();
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function getApiKeyFromRequest(req) {
  const headerKey = req.headers["x-openai-api-key"];

  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  return process.env.OPENAI_API_KEY || "";
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("请求体不是合法 JSON。");
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: [
        {
          type: "input_text",
          text: message.content.trim()
        }
      ]
    }));
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  const parts = [];

  for (const item of data.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n\n").trim();
}

async function handleChat(req, res) {
  const apiKey = getApiKeyFromRequest(req);

  if (!apiKey) {
    sendJson(res, 500, {
      error: "当前服务未配置共享 API Key。请先在网页中登录你自己的 OpenAI API Key，或在服务端配置 OPENAI_API_KEY。"
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    sendJson(res, 400, { error: "请至少提供一条用户消息。" });
    return;
  }

  const systemPrompt = await getSystemPrompt();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: systemPrompt,
        input: messages,
        text: {
          format: {
            type: "text"
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message || "调用模型失败，请检查模型名称、权限或 API Key。";
      sendJson(res, response.status, { error: message });
      return;
    }

    const output = extractOutputText(data);
    if (!output) {
      sendJson(res, 502, { error: "模型已返回响应，但未解析到文本内容。" });
      return;
    }

    sendJson(res, 200, {
      reply: output,
      model: data.model || MODEL,
      id: data.id || null
    });
  } catch (error) {
    sendJson(res, 500, {
      error: `请求 OpenAI 时出错：${error.message}`
    });
  }
}

async function handleConfig(_req, res) {
  sendJson(res, 200, {
    model: MODEL,
    requiresApiKey: !process.env.OPENAI_API_KEY
  });
}

async function handleHealth(_req, res) {
  sendJson(res, 200, {
    ok: true,
    model: MODEL,
    hasSharedApiKey: Boolean(process.env.OPENAI_API_KEY)
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(path.join(publicDir, pathname));

  if (!safePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(safePath);
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "HEAD") {
    sendNoContent(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    await handleHealth(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/config") {
    await handleConfig(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  sendText(res, 405, "Method Not Allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Munger Mindset web app running at http://${HOST}:${PORT}`);
});
