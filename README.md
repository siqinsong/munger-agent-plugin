# 芒格思维互动网页

这是一个轻量的互动网页。用户在浏览器输入问题后，服务端会调用 OpenAI 模型，并强制模型按“芒格思维”风格输出分析。

现在支持两种使用方式：

- 服务端共享 Key：部署方在 `.env` 中配置 `OPENAI_API_KEY`，用户打开网页即可直接使用
- 用户自带 Key 登录：如果服务端没有共享 Key，用户可在网页中输入自己的 OpenAI API Key，浏览器本地保存后直接使用

## 启动方式

1. 复制环境变量模板并填写 API Key：

```bash
cp .env.example .env
```

2. 启动服务：

```bash
npm run dev
```

3. 打开浏览器访问：

```text
http://localhost:3000
```

## 正式线上版

正式上线时，推荐直接使用服务端共享 Key 模式：

1. 在服务器或托管平台环境变量中设置：

```bash
OPENAI_API_KEY=你的服务端Key
OPENAI_MODEL=gpt-5.4
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

2. 启动服务后，用户访问网址即可直接使用，不需要再输入自己的 API Key。

3. 健康检查可使用：

```text
/api/health
```

4. 配置接口可使用：

```text
/api/config
```

当 `OPENAI_API_KEY` 已配置时，前端会自动跳过登录弹窗，直接进入聊天。

## Render 部署

这个项目已经附带 [render.yaml](/Users/songsiqin/munger%20mindset/render.yaml)，可以直接按 Render Blueprint 方式部署。

推荐步骤：

1. 把项目推到 GitHub
2. 在 Render 中选择 `New +` -> `Blueprint`
3. 连接对应 GitHub 仓库
4. Render 会自动识别仓库根目录的 `render.yaml`
5. 在创建页面填入 `OPENAI_API_KEY`
6. 部署完成后，打开 Render 分配的 `onrender.com` 地址即可直接使用

Render 相关要点：

- Web Service 需要绑定到 `0.0.0.0`
- 默认端口通常为 `10000`
- 本项目已提供 `/api/health` 作为健康检查路径

我参考的是 Render 官方文档：
- [Web Services](https://render.com/docs/web-services)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Default Environment Variables](https://render.com/docs/environment-variables)

## Docker 部署

项目已经附带 [Dockerfile](/Users/songsiqin/munger%20mindset/Dockerfile)。你可以这样构建和运行：

```bash
docker build -t munger-mindset-web .
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=你的服务端Key \
  -e OPENAI_MODEL=gpt-5.4 \
  munger-mindset-web
```

## 文件说明

- `server.mjs`：静态文件服务 + `/api/chat` 模型代理
- `public/`：网页界面
- `prompts/munger-system-prompt.txt`：基于 skill 整理的系统提示词
- `Dockerfile`：线上容器部署配置

## 默认模型

默认使用 `gpt-5.4`。如果你想换模型，可在 `.env` 里设置：

```bash
OPENAI_MODEL=你的模型名
```

## 说明

- 如果配置了服务端 `OPENAI_API_KEY`，用户可直接访问
- 如果没有配置服务端 key，页面会要求用户“登录”自己的 OpenAI API Key
- 用户输入的 key 只保存在当前浏览器的 `localStorage` 中，不写入项目文件
- 生产环境默认监听 `0.0.0.0`，更适合云服务器和容器部署
- 当前实现支持多轮对话，适合先澄清问题、再持续追问
- 页面不依赖前端框架，便于你后续继续改样式或接入更多能力
