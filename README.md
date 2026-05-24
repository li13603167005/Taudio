# Taudio

Taudio 是一个本地优先的私人 AI 电台原型。它把 AI DJ、音乐推荐、用户听歌画像、天气上下文、播放历史和移动端 Web UI 放在同一个体验里，目标不是再做一个歌单播放器，而是探索“懂你当下状态的私人电台”应该是什么样。

## 项目展示
主界面：
<img width="469" height="759" alt="image" src="https://github.com/user-attachments/assets/477734c3-4bcb-4113-9271-95330c6edba1" />
用户识别：<img width="622" height="405" alt="image" src="https://github.com/user-attachments/assets/bcfa5974-2878-40f9-b267-ab95c7cfbbc5" />

## 核心能力

- 提供一个 PWA 风格的私人电台网页界面。
- 根据用户画像、时间、天气、最近播放记录生成推荐上下文。
- 支持 DeepSeek 作为可选 AI 大脑，用于 DJ 文案和意图识别。
- 支持 OpenWeather 作为可选天气来源。
- 支持接入 `NeteaseCloudMusicApiEnhanced/api-enhanced` 作为外部音乐源。
- 支持使用网易云登录 Cookie 在服务端解析个人会员可播放链接。
- 使用 SQLite 保存本地聊天、播放、计划和偏好状态。
- 支持多用户听歌偏好文档。
- 在没有外部音乐 API 时，可回退到本地合成音频，方便离线演示和自检。

## 架构概览

```text
Browser PWA
  ├─ 电台 UI、播放队列、用户画像编辑
  ├─ 浏览器 speechSynthesis 播放 AI DJ 语音
  └─ 单一 audio 元素串联 DJ 语音和音乐

Taudio Node Server
  ├─ server/app.js          HTTP 路由、静态文件、WebSocket
  ├─ server/router.js       意图路由和电台响应编排
  ├─ server/music.js        本地曲库、网易云检索和播放解析
  ├─ server/brain.js        本地规则或 DeepSeek AI 大脑
  ├─ server/companion.js    当前歌曲讨论和伙伴式回复
  ├─ server/context.js      用户画像、天气、日程、最近播放
  ├─ server/state.js        SQLite 状态存储
  └─ server/users.js        用户画像文档管理

External Services
  ├─ DeepSeek API           可选 AI 大脑
  ├─ OpenWeather API        可选天气上下文
  └─ NetEase enhanced API   可选音乐源，需要单独运行
```

## 环境要求

- Node.js `>=24`
- 现代浏览器
- 可选：DeepSeek API Key
- 可选：OpenWeather API Key
- 可选：运行中的 `NeteaseCloudMusicApiEnhanced/api-enhanced`

项目使用 Node.js 内置的 `node:sqlite`，因此需要 Node.js 24 或更高版本。

## 快速启动

```bash
npm install
cp .env.example .env
npm start
```

打开：

```text
http://127.0.0.1:8080
```

运行自检：

```bash
npm run check
```

自检默认强制使用本地规则和 local-synth，不依赖你的真实 API Key、网易云 Cookie 或外部服务。

## 环境变量

复制 `.env.example` 为 `.env`，只填写你需要启用的能力。

常用配置：

```text
HOST=127.0.0.1
PORT=8080
TAUDIO_TIMEZONE=Asia/Shanghai

BRAIN_PROVIDER=local
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

MUSIC_PROVIDER=netease-enhanced
NETEASE_API_BASE=http://127.0.0.1:3000
NETEASE_COOKIE=
NETEASE_LEVEL=exhigh

TTS_PROVIDER=browser

OPENWEATHER_API_KEY=
OPENWEATHER_CITY=Shanghai
```

`.env` 已被 `.gitignore` 忽略。不要把 API Key、网易云 Cookie、代理配置或任何账号信息提交到仓库。

旧版本本地 `.env` 如果还在使用 `CLAUDIO_*` 变量名，服务端会做兼容读取；新配置建议统一使用 `TAUDIO_*`。

## DeepSeek

启用 DeepSeek：

```text
BRAIN_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here
```

如果没有配置 Key，Taudio 仍然可以使用本地规则 fallback 运行。

## OpenWeather

启用天气上下文：

```text
OPENWEATHER_API_KEY=your_key_here
OPENWEATHER_CITY=Hangzhou
```

也可以改用经纬度：

```text
OPENWEATHER_LAT=
OPENWEATHER_LON=
```

## 网易云音乐源

本仓库不包含网易云 API 服务。你需要单独运行：

```bash
git clone https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced.git
cd api-enhanced
npm install
node app.js
```

然后在 Taudio 的 `.env` 中配置：

```text
MUSIC_PROVIDER=netease-enhanced
NETEASE_API_BASE=http://127.0.0.1:3000
```

如果需要使用个人网易云会员账号解析可播放链接，可以运行：

```bash
npm run netease:login
```

扫码后生成的 `NETEASE_COOKIE` 只会写入本地 `.env`，不要提交到 GitHub。

## 用户画像

运行时用户数据是私有数据，默认不会提交：

```text
user/users.json
user/profiles/*.md
```

仓库中只保留一个公开示例：

```text
user/profiles/default.example.md
```

应用启动后会自动创建本地用户和画像文件。

## 仓库安全边界

以下内容不会进入仓库：

- `.env` 和真实 API Key
- `NETEASE_COOKIE`
- SQLite 运行时数据库：`server/state.db`
- 网易云登录二维码页：`public/netease-login.html`
- 生成的音乐和 TTS 缓存：`cache/`
- 日志文件：`*.log`
- 真实用户画像和用户索引
- 第三方 `api-enhanced` 源码和 `node_modules`

推送前建议执行：

```bash
npm run check
git status --short
```

再做一次敏感信息扫描：

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!cache/**' "API_KEY|COOKIE|SECRET|TOKEN|Bearer|sk-"
```

正常情况下，只应该看到 `.env.example`、README 中的占位符，以及代码里的变量名。

## 当前限制

- Taudio 仍然是原型，不是生产级音乐流媒体服务。
- 外部音乐播放依赖网易云增强 API 和账号可用性。
- 浏览器 TTS 质量取决于设备和浏览器内置语音。
- 如果要公开部署，需要先补登录鉴权和访问限制，避免暴露个人音乐账号和后端接口。

## License

暂未选择开源许可证。除非后续添加 `LICENSE` 文件，否则请将本仓库视为 source-available 项目。
