# VStandby Studio

**AI 驱动的体育 / 电竞实时观赛伴侣**

VStandby Studio 是一款面向体育和电竞赛事观众的 AI 实时伴侣应用。当你在观看 NBA、CS2、英雄联盟（LOL）等比赛时，AI 伴侣会像身边懂球的朋友一样，实时提供反应、洞察和场景化解说——让一个人的观赛体验不再孤单。

---

## 目录

- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [可用脚本](#可用脚本)
- [API 接口](#api-接口)
- [数据流架构](#数据流架构)
- [关键模块详解](#关键模块详解)
- [产品愿景](#产品愿景)
- [许可证](#许可证)

---

## 核心功能

### 1. YouTube 直播/点播双流接入（核心创新）

产品最具特色的功能——**用户感知零延迟**：

- **双播放器架构**：模型端观看直播的最新 live edge，用户端播放同一直播源延迟 5 秒后的画面
- **模型提前准备**：在用户看到精彩慢镜头之前，OpenCV 已完成运动帧检测和截图，输出端 LLM 提前生成候选话术
- **用户感知即时**：当用户看到精彩瞬间时，AI 数字人已经准备好要说的话，做到像真人一样的即时反应
- **支持 DVR 直播**：对支持暂停/回放的直播源（如 YouTube Live），利用同源双时间点播放；不支持的源通过后端 ring buffer 制造延迟
- **抽帧模式**：支持每 2 秒定时截图 或 运动检测触发截图，内存滚动缓存 120 张最新帧
- **录播支持**：对 VOD 点播视频，支持前 5 分钟 / 整段 / 最后 N 秒的运动帧提取

### 2. AI 伴侣聊天（Pipeline 架构）

- **两阶段流水线**：输入端模型（理解 + 结构化）→ 输出端模型（生成自然语言），两端可独立替换
- **四种触发来源**：
  - `user_message` — 用户主动说话
  - `visual_event` — 视频画面大幅变化检测
  - `score_change` — NBA 比分/回合变化
  - `idle_break` — 用户长时间沉默后的主动搭话
- **三种可切换人格**：
  - **Analyst（分析师）** — 冷静理性的战术分析，聚焦数据、效率、策略
  - **Trash Talker（垃圾话之王）** — 毒舌嘲讽风格，用大量体育俚语 diss 球员失误
  - **Emotional Fan（铁杆球迷）** — ALL CAPS 激情澎湃的死忠粉
- **聊天模型**：基于 Google Gemini 2.5 Flash，流式响应
- **自动播报**：比分/回合变化时自动触发 AI 反应（实时模式 8 秒冷却，回放模式 5 秒冷却）

### 3. 语音播报 (TTS)

- 使用 OpenAI `tts-1` 模型，`nova` 音色
- AI 回复自动转为语音朗读
- 队列式播放，支持随时打断和停止
- 通过 `AudioContext` + `AnalyserNode` 实时分析音频频率，驱动头像嘴型动画

### 4. 语音输入 (STT)

- **双模式支持**：
  - Web Speech API（浏览器内置，支持中文）
  - MediaRecorder + Whisper API（`/api/stt` 端点，跨浏览器兼容，适合 HTTP 环境）
- 语音识别后自动发送到聊天管道
- 配合 Pipeline 架构的二分路由判断：先判断用户问题是否和当前慢动作片段相关，相关则走预生成话术快路径，无关则转通用 LLM

### 5. 历史比赛回放

- 内置经典 NBA 比赛完整逐回合时间线数据（约 75 个行动/场）：
  - **2016 年 NBA 总决赛 G7**（骑士 vs 勇士）：The Block, The Shot, The Stop
  - **2023 年季后赛 G6**（湖人 vs 勇士）：LeBron 率湖人淘汰勇士
- 支持**倍速播放**（1x / 2x / 5x / 10x）
- 支持进度拖拽、暂停/继续、时间线跳转
- 比赛结束后可生成 **AI 全场总结**

### 6. 视频视觉分析（Gemini Vision）

- 上传视频片段，由 Google Gemini `gemini-2.0-flash` 模型逐帧分析比赛画面
- 返回带有时间戳的 AI 反应评论时间线
- 与视频播放进度实时同步：播放到对应时间点时自动插入 AI 评论
- 提供 LOL / NBA 预缓存的演示视觉分析数据

### 7. 实时运动帧提取（OpenCV）

- 基于 OpenCV 的帧差算法检测视频中的高运动画面（慢动作、进球、碰撞）
- **两种抽取模式**：
  - **定时模式**：每 N 秒截取 1 张 JPEG（默认 2s），忽略运动检测
  - **运动模式**：用 `compare_stride` 跨帧对比 + `motion_threshold` 阈值判定
- 后端 `/api/live-motion/*` 系列端点管理整个实时截帧生命周期（Start → Poll → Stop）
- 每张截图均为 JPEG data URL，被前端轮询（1 秒间隔）拉取并显示在画面上
- 支持持久化到 `motion_exports/` 目录

### 8. 数字人形象

- **2D 卡通吉祥物**（默认）：Chibi 灯泡造型 NBA 球迷角色，"23 号"球衣 + 头带，支持鼠标追踪视线、随机眨眼、语音驱动张嘴
- **SpatialReal 3D 数字人**：集成 `@spatialwalk/avatarkit` SDK，支持语音驱动嘴型同步（PCM16 音频推送），带降级策略（WebSocket 不通时回退到 HTML Audio 纯音频模式）
- **3D VRM 头像**（Phase 2）：基于 `@react-three/fiber` + `@pixiv/three-vrm` 的懒加载 3D 模块，支持 blendshape 表情驱动

### 9. 内部工作流程编辑器

- 可通过 `/BETA2026_workflow` 等路径访问的可视化 Pipeline 流程图
- 11 个可拖拽节点（5 种类型：source / input / context / output / avatar）
- 双向 SVG 箭头展示左右两条流水线（"伪零延迟线" + "实时互动线"）
- 节点配置保存到浏览器 localStorage

---

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript ~5.8 | 类型安全 |
| Vite 6 | 构建工具 & 开发服务器 |
| Tailwind CSS 4 | 样式框架 |
| Motion (Framer Motion) | 动画库 |
| Lucide React | 图标库 |
| @spatialwalk/avatarkit | 3D 数字人 SDK |
| @react-three/fiber + @pixiv/three-vrm | 3D VRM 头像（可选） |
| clsx + tailwind-merge | 类名合并工具 |

### 后端

| 技术 | 用途 |
|------|------|
| Python 3.10+ | 后端语言 |
| FastAPI | Web 框架 |
| Uvicorn | ASGI 服务器 |
| Google Genai SDK | Gemini 聊天 + 视觉分析 |
| OpenAI SDK | TTS 语音合成 + STT 语音转写 |
| nba_api | NBA 实时比赛数据 |
| OpenCV (cv2) | 视频运动帧检测 |
| yt-dlp | YouTube 视频流下载 |
| WebSocket | 实时数据推送 |
| SpatialReal API | 3D 数字人会话令牌 |

### AI 模型

| 模型 | 用途 | 调用方 |
|------|------|--------|
| Gemini 2.5 Flash | 聊天对话（主模型） | `/api/chat`, `/api/chat/vision` |
| Gemini 2.5 Flash | 比赛总结 | `/api/chat/summary` |
| Gemini 2.0 Flash | 视频视觉分析 | `/api/vision/analyze` |
| GPT-4o-mini (OpenAI) | Pipeline 输出端模型 | `/api/pipeline/react` |
| TTS-1 (OpenAI) | 文字转语音 | `/api/tts` |
| Whisper-1 (OpenAI) | 语音转文字 | `/api/stt` |

---

## 项目结构

```
VStandby/
├── .env.example                    # 环境变量模板
├── .gitignore
├── CLAUDE.md                       # AI 编程助手指引
├── README.md                       # 本文件
├── metadata.json                   # 应用名称与描述
├── package.json                    # Node 依赖与脚本
├── requirements.txt                # Python 依赖
├── tsconfig.json                   # TypeScript 配置
├── vite.config.ts                  # Vite 构建配置（含 API 代理 + WebSocket 代理）
├── index.html                      # HTML 入口
│
├── backend/
│   ├── __init__.py
│   ├── main.py                     # FastAPI 后端：所有 API 端点（~1355 行）
│   ├── historical_games.py         # 精选历史 NBA 比赛时间线数据
│   ├── motion_frames.py            # OpenCV 运动帧提取核心（离线 + 实时模式）
│   └── motion_exports/             # 运动帧截图导出目录（运行时生成）
│
├── src/
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 主应用（路由分发：主页面 + 内部工作流页面）
│   ├── index.css                   # Tailwind + 自定义样式
│   ├── lib/
│   │   ├── utils.ts                # 工具函数（cn 类名合并）
│   │   ├── pipelineClient.ts       # Pipeline API 客户端（类型定义 + 请求）
│   │   └── frameCapture.ts         # 视频帧截取 + 指纹场景变化检测
│   ├── hooks/
│   │   ├── useGameSimulation.ts    # 比赛状态管理（实时 WS + 历史回放）
│   │   └── useAICompanion.ts       # AI 聊天、自动播报、TTS、视觉分析、Pipeline 管线
│   └── components/
│       ├── YouTubeLiveCompanionDemo.tsx  # 主演示页面：YouTube 双播放器 + 数字人
│       ├── AIAvatarOrb.tsx         # 2D AI 动态光球（Chibi NBA 吉祥物 SVG）
│       ├── AIAvatar3D.tsx          # 3D VRM 头像（Phase 2，懒加载，需要额外 deps）
│       ├── SpatialRealAvatar.tsx   # SpatialReal 3D 数字人组件
│       ├── PetChatPanel.tsx        # AI 伴侣聊天面板（含头像、气泡、人设切换）
│       └── PipelineBuilder.tsx     # 内部工作流程编辑器（可拖拽的可视化流程图）
│
├── tools/                          # 独立工具脚本（非 web app 的一部分）
│   ├── extract_tool/               # 独立运动帧提取 CLI（backend/motion_frames.py 的原型）
│   ├── subtitle_extraction/        # YouTube 字幕下载工具
│   └── live_subtract/              # YouTube 直播实时音频转录工具
│
├── public/
│   └── premium_companion_overlay.png # 产品 Banner 图
│
└── product-pitch-cn.md             # 产品理念中文说明书
```

---

## 快速开始

### 前置条件

- **Node.js** 18+ （推荐 LTS 版本）
- **Python** 3.10+
- **Google Gemini API Key**（用于 AI 聊天、视觉分析）
- **OpenAI API Key**（用于 TTS 语音合成、STT 语音转写）
- **SpatialReal API Key**（可选，用于 3D 数字人功能）
- **ffmpeg / ffprobe**（可选，用于视频时长探测）

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/siruizou2005/VStandby.git
cd VStandby
```

#### 2. 安装前端依赖

```bash
npm install
```

#### 3. 创建 Python 虚拟环境并安装后端依赖

```bash
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

> **注意**：`opencv-python` 和 `yt-dlp` 在 requirements.txt 中。如果安装 OpenCV 遇到问题，可以尝试 `pip install opencv-python-headless`。

#### 4. 配置环境变量

创建 `.env.local` 文件在项目根目录，填入你的 API Key：

```env
GEMINI_API_KEY="你的-Gemini-API-Key"
OPENAI_API_KEY="你的-OpenAI-API-Key"
SPATIALREAL_API_KEY="你的-SpatialReal-API-Key"    # 可选
VITE_SPATIALREAL_APP_ID="你的-SpatialReal-App-ID"  # 可选
APP_URL="http://localhost:3000"                     # 可选
```

#### 5. 启动开发服务器

```bash
npm run dev
```

此命令通过 `concurrently` 同时启动：

- **后端**：`uvicorn` 监听 **8000** 端口，自动热重载
- **前端**：`Vite` 监听 **3000** 端口，自动代理 `/api/*` 请求到后端

#### 6. 打开浏览器访问 `http://localhost:3000`

---

## 环境变量配置

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `GEMINI_API_KEY` | 是 | Google Gemini API 密钥，用于聊天（Gemini 2.5 Flash）和视觉分析（Gemini 2.0 Flash） |
| `OPENAI_API_KEY` | 是 | OpenAI API 密钥，用于语音合成（`tts-1`）、语音转写（`whisper-1`）和 Pipeline 输出端（`gpt-4o-mini`） |
| `SPATIALREAL_API_KEY` | 否 | SpatialReal 3D 数字人 API 密钥 |
| `VITE_SPATIALREAL_APP_ID` | 否 | SpatialReal 应用 ID（前端注入） |
| `APP_URL` | 否 | 应用部署 URL，用于自引用链接 |
| `DISABLE_HMR` | 否 | 设置为 `true` 时禁用 Vite 热模块替换（适用于 AI Studio 等代理编辑环境） |

### Vite 开发服务器配置

- **端口**：`3000`
- **API 代理**：`/api` → `http://127.0.0.1:8000`（包括 WebSocket）
- **WebSocket 代理**：`/api/ws/*` 请求自动转发到 uvicorn
- **路径别名**：`@/` → 项目根目录

---

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动后端（:8000）和前端（:3000）开发服务器 |
| `npm run build` | 生产环境构建（Vite build） |
| `npm run preview` | 预览生产环境构建 |
| `npm run clean` | 清除 `dist/` 构建目录 |
| `npm run lint` | TypeScript 类型检查（`tsc --noEmit`） |

---

## API 接口

后端运行在 `http://localhost:8000`。以下为主要端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ws/{sport}` | WebSocket | 实时比赛数据流。NBA 使用 `nba_api` 真实数据，CS2/LOL 返回静态模拟数据 |
| `/api/chat` | POST | AI 聊天（基于 Gemini 2.5 Flash，流式响应，支持人格选择） |
| `/api/chat/vision` | POST | 带视觉帧的 AI 聊天（多模态，接收图片帧 data URL） |
| `/api/chat/summary` | POST | 比赛 AI 全场总结（流式响应，基于 Gemini 2.5 Flash） |
| `/api/tts` | POST | 文字转语音（OpenAI `tts-1`，`nova` 音色，返回 `audio/mpeg`） |
| `/api/stt` | POST | 语音转文字（OpenAI `whisper-1`，支持 webm/mp4 音频上传） |
| `/api/pipeline/react` | POST | 两阶段 Pipeline 反应接口（输入端理解 + 输出端生成） |
| `/api/vision/analyze` | POST | 上传视频文件进行 Gemini 视觉分析，返回带时间戳的评论时间线 |
| `/api/vision/demo/{sport}` | GET | 获取预缓存的演示视觉分析数据（LOL / NBA） |
| `/api/vision/motion-frames` | POST | 上传视频文件提取运动帧（OpenCV 离线分析） |
| `/api/vision/motion-frames-url` | POST | 通过 URL 下载视频并提取运动帧（支持 yt-dlp + 限制时长/片段时间范围） |
| `/api/live-motion/start` | POST | 启动 YouTube 直播流实时运动帧提取（后台线程） |
| `/api/live-motion/stop` | POST | 停止实时运动帧提取 |
| `/api/live-motion/frames` | GET | 获取当前实时提取的运动帧列表和状态 |
| `/api/games/historical` | GET | 获取历史比赛元数据列表 |
| `/api/games/historical/{game_id}/playbyplay` | GET | 获取指定历史比赛的完整逐回合时间线数据 |
| `/api/session-token` | GET | 获取 SpatialReal 3D 数字人会话令牌（1 小时有效期） |
| `/api/motion-exports/{file}` | GET | 静态文件服务 — 访问导出的运动帧 JPEG 文件 |

---

## 数据流架构

### 整体拓扑

```
┌──────────────────────────────────────────────────────────────────┐
│                         后端 (FastAPI :8000)                      │
│                                                                    │
│  background_nba_task() ─── nba_api 每 8s 轮询 ─── global_game_state
│        │                                                          │
│        └──────► WebSocket /api/ws/nba ──► 广播给所有连接客户端      │
│                                                                    │
│  /api/chat ─── Gemini 2.5 Flash (流式响应)                         │
│  /api/tts  ─── OpenAI tts-1                                       │
│  /api/stt  ─── OpenAI whisper-1                                   │
│  /api/vision/analyze ─── Gemini 2.0 Flash (文件 API)               │
│  /api/live-motion/*  ─── OpenCV (帧差检测) + yt-dlp (流下载)       │
│  /api/pipeline/react ─── GPT-4o-mini (输出模型适配器)               │
└──────────────────────────────────────────────────────────────────┘
        │                                    │
        │ HTTP/WebSocket                     │ Static Files
        ▼                                    ▼
┌─────────────────────────────┐    ┌──────────────────────────┐
│    前端 (React :3000)        │    │  motion_exports/          │
│                              │    │  (OpenCV 截图 JPEG)       │
│  ┌─ YouTubeLiveCompanionDemo│    └──────────────────────────┘
│  │  ├─ 用户播放器 (延迟 5s)  │
│  │  ├─ 模型播放器 (live edge)│
│  │  └─ 数字人 (SpatialReal)  │
│  │                           │
│  ├─ useGameSimulation        │
│  │  ├─ Live: WebSocket       │
│  │  └─ Historical: 定时播放   │
│  │                           │
│  ├─ useAICompanion           │
│  │  ├─ Pipeline 管线         │
│  │  ├─ TTS 语音队列          │
│  │  └─ Vision 视觉同步       │
│  │                           │
│  └─ frameCapture             │
│     ├─ 视频帧截取 (canvas)    │
│     └─ 场景变化检测 (指纹diff) │
└─────────────────────────────┘
```

### 关键数据流

#### 1. NBA 实时数据流

```
nba_api (每 8s)
    └─► fetch_nba_data() → global_game_state
        └─► WebSocket 广播 → 所有 /api/ws/nba 客户端
            └─► useGameSimulation (live 模式)
                └─► gameContext.lastPlay 变化
                    └─► useAICompanion 触发自动播报
```

#### 2. YouTube 直播 "伪零延迟" 流

```
YouTube 直播源
    ├─► 模型播放器 (live edge, 静音, 隐藏)
    │   └─► /api/live-motion/start → OpenCV 持续截帧
    │       ├─► 运动帧入缓冲池 (最多 120 张)
    │       └─► 前端每 1s 轮询拉取帧列表
    │           └─► 帧变化检测 → 触发 visual_event/score_change
    │               └─► /api/pipeline/react
    │                   ├─► 输入模型: 理解画面 + 结构化
    │                   └─► 输出模型: 生成 AI 反应文本
    │
    └─► 用户播放器 (live edge - 5s)
        └─► 当画面播放到精彩瞬间时，AI 话术已准备好
```

#### 3. 用户聊天流

```
用户输入文字
    └─► useAICompanion.sendMessage()
        └─► runPipelineReaction({ reason: 'user_message' })
            ├─► 附带最近 2 帧视觉帧 (如有)
            └─► POST /api/pipeline/react
                ├─► 输入端: 理解意图 + 结构化上下文
                ├─► 输出端: GPT-4o-mini 生成回复
                └─► 返回文本
                    ├─► 追加到消息列表
                    └─► TTS 队列 → OpenAI tts-1 → 播放
                        └─► AudioContext AnalyserNode → 嘴型动画
```

#### 4. Vision 视觉分析流

```
用户上传视频文件
    └─► POST /api/vision/analyze
        ├─► 上传到 Gemini File API
        ├─► 等待处理完成 (轮询状态)
        └─► Gemini 2.0 Flash 分析
            └─► 返回 JSON: [{timestamp, comment}, ...]
                └─► visionTimeline 状态
                    └─► 视频播放时 syncVision(currentTime)
                        └─► 到达对应时间戳 → 插入 AI 评论
```

#### 5. 历史回放流

```
用户选择历史比赛
    └─► GET /api/games/historical → 比赛列表
    └─► GET /api/games/historical/{id}/playbyplay → 时间线
        └─► useGameSimulation (historical 模式)
            ├─► 周期: 6000ms / 倍速
            └─► 逐条更新 gameContext
                └─► lastPlay 变化 → 触发 AI 自动反应
    └─► 比赛结束 → /api/chat/summary → AI 全场总结
```

---

## 关键模块详解

### `backend/main.py` — 单文件后端（~1355 行）

- **FastAPI 应用**，启用 CORS，挂载 `/api/motion-exports` 静态文件服务
- **`background_nba_task()`**：asyncio 无限循环，每 8 秒调用 `fetch_nba_data()` 并广播 WebSocket
- **`fetch_nba_data()`**：通过 `nba_api` 的 `ScoreboardV2` + `PlayByPlayV2` 获取实时比赛数据；非直播时段用 `LeagueGameFinder` 回放历史比赛
- **`analyze_play_for_video()`**：根据比赛描述文字匹配预置视频片段（3PT / BLOCK / DUNK 等）
- **`/api/chat`** 和 **`/api/chat/vision`**：使用 Google Genai SDK (`gemini-2.5-flash`) 实现流式聊天，支持多轮对话、人设系统 prompt、视觉帧注入
- **`/api/pipeline/react`**：两阶段 Pipeline 适配器 — 输入端理解 → 输出端生成，用 GPT-4o-mini 作为输出模型
- **`/api/live-motion/*`**：实时运动帧提取的完整生命周期管理，使用 `background_live_motion_task()` 后台线程
- **`/api/vision/motion-frames-url`**：通过 yt-dlp 下载视频 → OpenCV 帧差分析 → 保存帧到 `motion_exports/`

### `backend/motion_frames.py` — OpenCV 运动帧提取核心

- **`extract_motion_frames()`**：离线模式 — 读取视频文件，逐帧计算灰度差，超过阈值 + 冷却时间满足时保存 JPEG
  - 支持 `max_duration_seconds`（限制解码时长，默认前 5 分钟）/ `start_seconds` / `last_n_seconds`
  - 生成 `data:image/jpeg;base64` 格式的 data URL + 可选文件持久化
- **`extract_live_motion_frames()`**：实时模式 — 读取网络流 URL，支持 `compare_stride` 跨帧对比（不是仅相邻帧）
  - 支持 `sample_interval_seconds` 定时截图模式（忽略运动检测）
  - 通过回调函数 `callback(motionFrame)` 实时推送检测结果
  - 含 `stop_event` 线程控制机制
- **`probe_video_duration_seconds()`**：通过 OpenCV + ffprobe 探测视频时长

### `backend/historical_games.py` — 历史比赛数据

- **`HISTORICAL_GAMES_METADATA`**：比赛元数据列表（id, title, date, desc）
- **`HISTORICAL_GAMES_TIMELINES`**：以 game_id 为 key 的时间线字典，每场比赛含约 75-100 条回合记录
- 每条记录含 `clock`、`quarter`（Q1-Q4）、`score`（如 "CLE 93 - 89 GSW"）、`desc`（英文描述）、`isHighlight` 标记

### `useGameSimulation` — 比赛模拟 Hook

- **双模式运行**：
  - **Live 模式**：WebSocket 连接 `/api/ws/{sport}`，自动重连（3 秒间隔）
  - **Historical 模式**：定时 `setInterval` 逐条播放时间线，默认 6 秒/条（可倍速调整）
- **`GameContext` 类型**：`{ teams, score, clock, lastPlay, excitement, isReplay?, videoUrl? }`
- **播放控制**：`isPlaying`、`playbackSpeed`（1x/2x/5x/10x）、`currentIndex`、`scrubTo(index)`

### `useAICompanion` — AI 伴侣 Hook（~534 行）

- **核心 Pipeline 管道** `triggerBroadcast(reason)` → `runPipelineReaction()`:
  1. 收集视觉帧（最近 2 帧的 data URL）
  2. 调用 `POST /api/pipeline/react`
  3. 获得 AI 文本 → 追加消息 → 入队 TTS 朗读
- **视觉感知循环**（`visionEnabled` 为 true 时）：
  - 每 800ms 从 `<video>` 截取一帧（canvas → JPEG data URL）
  - 16x16 灰度指纹比较，超过阈值（0.08）触发 `visual_event`
  - 保持最近 5 帧的滑动缓冲区
- **空闲打断**：观看视频时，若 28 秒内无任何互动，AI 会主动说一句轻度观察
- **自动播报**：监听 `gameContext.lastPlay` 变化，冷却期后触发 `score_change` 反应
- **TTS 队列**：支持排队播放，前一条结束自动播下一条
- **Vision 同步**：`syncVision(currentTime)` 检查 visionTimeline，到达标记时间戳时输出评论
- **对话总结**：`askGameSummary()` 流式调用 `/api/chat/summary`，边说边 TTS

### `frameCapture` — 视频帧截取库

- **`captureFrame(video)`**：从 `<video>` 元素截帧（canvas → JPEG data URL），压缩到最大 512px
- **指纹计算**：16x16 灰度缩略图的像素值数组（256 字节）
- **`fingerprintDiff(a, b)`**：两张帧的均值绝对差，0-1 范围：
  - `< 0.04` → 近静止画面 / 暂停
  - `0.04-0.10` → 正常运动
  - `> 0.12` → 场景切换 / 大幅视觉变化

### `AIAvatarOrb` — 2D AI 吉祥物头像

- **Chibi 灯泡造型**：圆头 + NBA 球衣身体（"23 号"），橙色头带
- **嘴型同步**：AudioContext RMS → 平滑插值 → SVG 椭圆嘴型开合
- **视线追踪**：鼠标位置归一化 → 瞳孔偏移（±1.6px）
- **随机眨眼**：3-6 秒间隔，150ms 闭眼时长
- **兴奋度反应**：`excitement` 影响眼睛大小、表情光点亮度、脸颊红晕、弹跳幅度
- **人设色彩**：分析师=橙色、垃圾话=红色、铁杆球迷=金色

### `YouTubeLiveCompanionDemo` — 主演示页面

- **播放模式切换**：直播（双播放器）/ 录播（单播放器）
- **YouTube iframe API**：动态加载，双播放器实例（模型端 + 用户端）
- **直播运动帧配置面板**：抽帧模式（定时/运动检测）、缓冲区大小、持久化开关
- **录播运动帧提取**：支持前 5 分钟 / 整段 / 最后 5 分钟三种提取策略
- **数字人面板**：集成 SpatialRealAvatar 3D 数字人，支持麦克风按键对话

### `SpatialRealAvatar` — 3D 数字人组件

- 使用 `@spatialwalk/avatarkit` SDK 加载云端 3D 数字人模型
- 支持语音驱动嘴型同步（MP3 → PCM16 转换）
- WebSocket 连接失败自动降级为 HTML Audio 纯音频模式
- 集成麦克风录音（MediaRecorder → `/api/stt` Whisper 转写）
- 通过 `useImperativeHandle` 暴露 `sendAudio` / `initAudio` / `stopSpeaking` 方法

---

## 产品愿景

### 一句话定位

VStandby Studio 是一个面向**孤独观赛人群**的 AI 数字人陪伴产品。它不是赛后分析工具，而是能和用户一起看比赛、一起反应、一起吐槽的**实时观赛伙伴**。

### 目标用户

- 一个人在宿舍、家中或通勤时看比赛，想要有人一起聊球
- 朋友不在同一时区，无法实时连麦
- 不想进入嘈杂的直播弹幕，但想要一个懂球的陪伴对象
- 希望 AI 围绕自己的偏好（球员、球队、风格）提供定制化解说

### 核心创新：用户感知零延迟

传统 AI 观赛产品的痛点是：画面发生 → 上传 → 分析 → 生成 → 说话，用户听到时精彩瞬间已经过去了 30 秒。

我们的方案是：

1. **模型端**提前观看直播的最新 live edge
2. **用户端**观看同一直播源延迟几秒后的位置
3. 模型在用户看到画面之前，已完成慢动作检测 → 截帧 → LLM 分析 → 生成话术
4. 当用户看到那个精彩瞬间时，AI **已经准备好了要说的话**

这让 AI 不再像慢半拍的工具，而像一个真正坐在你旁边、刚好也看懂了这一球的伙伴。

### 内部工作流（两条线）

**左线 — "伪"零延迟准备线**：
```
模型 Live Edge → OpenCV 慢动作检测 → 5fps 截图
    → 字幕/解说文本 + 截图组 → 输出端多模态 LLM
    → 预生成话术池 → 数字人
```

**右线 — 用户实时互动线**：
```
用户延迟流 → 用户语音/文字输入 → STT + 二分判断
    ├─ 相关 → 直接取预生成话术（秒回）
    └─ 不相关 → 通用大模型处理
```

### 落地优先级

**已实现**：
- [x] YouTube 直播双路流（模型 live edge + 用户延迟）
- [x] OpenCV 运动帧检测 + 定时截图
- [x] Gemini / GPT-4o-mini 多模型 Pipeline
- [x] 三种 AI 人设 + TTS 语音朗读
- [x] Whisper STT 语音输入
- [x] 历史比赛回放 + AI 总结
- [x] Gemini Vision 视频分析
- [x] 2D 吉祥物 + 3D 数字人双模式
- [x] Pipeline 可视化编辑器

**规划中**：
- [ ] 用户偏好设置（话多/话少、喜欢球员、支持球队）
- [ ] 片段相关/无关二分路由优化
- [ ] 历史片段和偏好记忆持久化
- [ ] 数字人表情和语音风格个性化
- [ ] 更多体育/电竞项目支持

---

## 许可证

本项目的源文件采用 **Apache-2.0** 许可证。

```
SPDX-License-Identifier: Apache-2.0
```
