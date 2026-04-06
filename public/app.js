const messagesEl = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const questionInput = document.querySelector("#questionInput");
const sendBtn = document.querySelector("#sendBtn");
const resetBtn = document.querySelector("#resetBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const manageKeyBtn = document.querySelector("#manageKeyBtn");
const statusText = document.querySelector("#statusText");
const exampleButtons = document.querySelectorAll(".example-chip");
const loginModal = document.querySelector("#loginModal");
const loginForm = document.querySelector("#loginForm");
const apiKeyInput = document.querySelector("#apiKeyInput");
const loginStatus = document.querySelector("#loginStatus");
const skipLoginBtn = document.querySelector("#skipLoginBtn");
const modelBadge = document.querySelector("#modelBadge");

const conversation = [];
const storageKey = "munger_openai_api_key";
let serviceConfig = {
  requiresApiKey: false,
  model: ""
};

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function markdownToHtml(markdown) {
  const safe = escapeHtml(markdown);
  const blocks = safe.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks
    .map((block) => {
      if (block.startsWith("### ")) {
        return `<h4>${block.slice(4)}</h4>`;
      }

      if (block.startsWith("## ")) {
        return `<h3>${block.slice(3)}</h3>`;
      }

      if (block.startsWith("# ")) {
        return `<h2>${block.slice(2)}</h2>`;
      }

      if (block.startsWith("> ")) {
        return `<blockquote>${block
          .split("\n")
          .map((line) => line.replace(/^&gt;\s?/, ""))
          .join("<br>")}</blockquote>`;
      }

      if (/^[-*]\s/m.test(block)) {
        const items = block
          .split("\n")
          .filter((line) => /^[-*]\s/.test(line))
          .map((line) => `<li>${line.replace(/^[-*]\s/, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      if (/^\d+\.\s/m.test(block)) {
        const items = block
          .split("\n")
          .filter((line) => /^\d+\.\s/.test(line))
          .map((line) => `<li>${line.replace(/^\d+\.\s/, "")}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function renderMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "你的问题" : "芒格思维助手";

  const body = document.createElement("div");
  body.className = "message-body";
  body.innerHTML = role === "assistant" ? markdownToHtml(content) : escapeHtml(content).replace(/\n/g, "<br>");

  article.append(label, body);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(role, content) {
  conversation.push({ role, content });
  renderMessage(role, content);
}

function getStoredApiKey() {
  return localStorage.getItem(storageKey) || "";
}

function setStoredApiKey(value) {
  if (value) {
    localStorage.setItem(storageKey, value);
  } else {
    localStorage.removeItem(storageKey);
  }
}

function hasUsableKey() {
  return Boolean(getStoredApiKey() || !serviceConfig.requiresApiKey);
}

function openLoginModal(message = "API Key 仅保存在当前浏览器的本地存储中，不写入这个项目文件。") {
  loginModal.classList.remove("hidden");
  loginModal.setAttribute("aria-hidden", "false");
  apiKeyInput.value = getStoredApiKey();
  loginStatus.textContent = message;
  window.setTimeout(() => apiKeyInput.focus(), 0);
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
  loginModal.setAttribute("aria-hidden", "true");
}

function refreshAuthUi() {
  const stored = getStoredApiKey();
  const usingSharedKey = !serviceConfig.requiresApiKey;

  logoutBtn.disabled = !stored;
  manageKeyBtn.classList.toggle("hidden", usingSharedKey);
  logoutBtn.classList.toggle("hidden", usingSharedKey);

  if (stored) {
    statusText.textContent = "当前使用的是你在浏览器中登录的个人 API Key。";
    return;
  }

  statusText.textContent = serviceConfig.requiresApiKey
    ? "当前服务没有共享 Key，请先登录你自己的 API Key。"
    : "当前可以直接使用服务端共享 Key，也可以切换成你自己的 Key。";
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  resetBtn.disabled = loading;
  logoutBtn.disabled = loading || !getStoredApiKey();
  manageKeyBtn.disabled = loading;
  questionInput.disabled = loading;
  sendBtn.textContent = loading ? "分析中..." : "开始分析";
  if (loading) {
    statusText.textContent = "模型正在按芒格框架推演，请稍等。";
  } else {
    refreshAuthUi();
  }
}

async function submitMessage(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }

  if (!hasUsableKey()) {
    openLoginModal("当前服务未提供共享 Key，请先输入你自己的 OpenAI API Key。");
    return;
  }

  addMessage("user", trimmed);
  setLoading(true);
  questionInput.value = "";

  try {
    const apiKey = getStoredApiKey();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-openai-api-key": apiKey } : {})
      },
      body: JSON.stringify({
        messages: conversation
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "请求失败。");
    }

    addMessage("assistant", data.reply);
    statusText.textContent = `本轮由模型 ${data.model} 完成。`;
  } catch (error) {
    addMessage(
      "assistant",
      `## 调用失败\n\n${error.message}\n\n请检查你的 API Key、模型权限，以及服务端网络连通性。`
    );
    statusText.textContent = "这次请求没有成功，但页面仍可继续使用。";
  } finally {
    setLoading(false);
    questionInput.focus();
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitMessage(questionInput.value);
});

resetBtn.addEventListener("click", () => {
  conversation.length = 0;
  messagesEl.innerHTML = "";
  renderMessage("assistant", "先把你的问题说清楚。越具体，回答越有穿透力。");
  statusText.textContent = "对话已清空，你可以重新开始。";
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.prompt || "";
    questionInput.focus();
  });
});

manageKeyBtn.addEventListener("click", () => {
  openLoginModal();
});

logoutBtn.addEventListener("click", () => {
  setStoredApiKey("");
  refreshAuthUi();
  openLoginModal("你已经退出本地登录。重新输入 API Key 后可继续使用。");
});

skipLoginBtn.addEventListener("click", () => {
  if (serviceConfig.requiresApiKey && !getStoredApiKey()) {
    loginStatus.textContent = "这个服务当前没有共享 Key，不能跳过登录。";
    return;
  }

  closeLoginModal();
  refreshAuthUi();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const key = apiKeyInput.value.trim();
  if (!key) {
    loginStatus.textContent = "请输入有效的 OpenAI API Key。";
    return;
  }

  setStoredApiKey(key);
  closeLoginModal();
  refreshAuthUi();
  statusText.textContent = "已登录个人 API Key，现在可以远程直接使用。";
});

async function init() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "读取配置失败。");
    }

    serviceConfig = {
      requiresApiKey: Boolean(data.requiresApiKey),
      model: data.model || ""
    };

    modelBadge.textContent = serviceConfig.requiresApiKey
      ? `模型：${serviceConfig.model || "未知"} · 需要用户登录自己的 API Key`
      : `模型：${serviceConfig.model || "未知"} · 可直接使用服务端共享 Key`;

    refreshAuthUi();

    if (!hasUsableKey()) {
      openLoginModal("当前服务未配置共享 Key。请输入你自己的 OpenAI API Key 后再开始。");
    }
  } catch (error) {
    modelBadge.textContent = "服务配置读取失败";
    openLoginModal(`初始化失败：${error.message}`);
  }
}

init();
