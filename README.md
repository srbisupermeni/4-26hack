<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# VStandby Studio

**AI 驱动的体育 / 电竞实时观赛伴侣**

VStandby Studio 是一款面向体育和电竞赛事观众的 AI 实时伴侣应用。当你在观看 NBA、CS2、英雄联盟（LOL）等比赛时，AI 伴侣会坐在你身旁，实时提供反应、洞察、预测和场景化解说——就像身边有一位懂球的朋友。

> 在 AI Studio 中查看: https://ai.studio/apps/b195854f-4162-468d-946e-22cadeee0a33

---

## 目录

- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [可用脚本](#可用脚本)
- [API 接口](#api-接口)
- [关键模块详解](#关键模块详解)
- [许可证](#许可证)

---

## 核心功能

### 实时比赛追踪
- 通过 `nba_api` 接入真实的 NBA 比赛数据，每 8 秒通过 WebSocket 推送一次实时赛况
- 支持多项目：NBA（实时数据）、CS2 和 LOL（模拟数据）
- YouTube 视频嵌入作为演示回放

### AI 伴侣聊天
- 基于 OpenAI `gpt-4o-mini` 模型的智能对话
- 三种可选人格：
  - **分析师 (Analyst)** — 冷静理性的战术分析
  - **垃圾话之王 (Trash Talker)** — 毒舌嘲讽风格
  - **铁杆球迷 (Emotional Fan)** — 激情澎湃的死忠粉
- 赛况变化时自动播报 AI 反应（实时模式 8 秒冷却，回放模式 5 秒冷却）

### 语音播报 (TTS)
- 使用 OpenAI `tts-1` 模型，`nova` 音色
- AI 回复可一键朗读，配备实时音频可视化球体动效

### 历史比赛回放
- 内置经典比赛完整逐回合时间线数据，例如：
  - 2016 年 NBA 总决赛 G7（骑士 vs 勇士）
  - 2023 年季后赛 G6（湖人 vs 勇士）
- 支持倍速播放（1x / 2x / 5x / 10x）、进度拖拽、暂停/继续
- 比赛结束后可生成 AI 全场总结

### 视频视觉分析
- 上传视频片段，由 Google Gemini (`gemini-2.0-flash`) 逐帧分析
- 返回带有时间戳的 AI 反应评论，与视频播放进度实时同步
- LOL / NBA 项目提供预缓存的演示视觉分析数据

### 精美落地页
- 完整的营销展示页面，包含英雄区、功能网格、交互式演示
- "工作原理"流程图、使用场景、愿景声明、CTA/等待列表等模块

---

## 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| TypeScript | 5.8 | 类型安全 |
| Vite | 6 | 构建工具 & 开发服务器 |
| Tailwind CSS | 4 | 样式框架 |
| Motion | 12+ | 动画库（原 Framer Motion） |
| Lucide React | — | 图标库 |

### 后端
| 技术 | 用途 |
|------|------|
| Python 3 | 后端语言 |
| FastAPI | Web 框架 |
| Uvicorn | ASGI 服务器 |
| OpenAI SDK | AI 聊天 & TTS |
| Google Genai SDK | Gemini 视觉分析 |
| nba_api | NBA 实时数据 |
| WebSocket | 实时数据推送 |

---

## 项目结构

```
VStandby-Studio/
├── .env.example                    # 环境变量模板
├── .gitignore
├── README.md                       # 本文件
├── metadata.json                   # 应用名称与描述
├── package.json                    # Node 依赖与脚本
├── requirements.txt                # Python 依赖
├── tsconfig.json                   # TypeScript 配置
├── vite.config.ts                  # Vite 构建配置（含 API 代理）
├── index.html                      # HTML 入口
│
├── backend/
│   ├── __init__.py
│   ├── main.py                     # FastAPI 后端：所有 API 端点
│   └── historical_games.py         # 精选历史比赛时间线数据
│
├── src/
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 主应用（落地页 + 交互式演示）
│   ├── App_original.tsx            # 早期简化版 App
│   ├── index.css                   # Tailwind + 自定义样式
│   ├── lib/
│   │   └── utils.ts                # 工具函数（cn 类名合并）
│   ├── hooks/
│   │   ├── useGameSimulation.ts    # 比赛状态管理（实时 WS + 历史回放）
│   │   └── useAICompanion.ts       # AI 聊天、自动播报、TTS、视觉分析
│   └── components/
│       ├── AIAvatarOrb.tsx         # AI 动态光球（带音频可视化）
│       ├── ChatPanel.tsx           # 聊天面板组件
│       ├── GamePanel.tsx           # 计分板组件
│       ├── LiveContextPanel.tsx    # 实时赛况面板（回合信息、兴奋度）
│       └── VideoPlayer.tsx         # 视频播放器（YouTube 嵌入）
│
├── public/
│   └── premium_companion_overlay.png
│
└── test_*.py                       # 各类测试脚本（OpenAI/NBA/TTS/Gemini/WebSocket）
```

---

## 快速开始

### 前置条件

- **Node.js** 18+ （推荐 LTS 版本）
- **Python** 3.10+
- **OpenAI API Key**（用于 AI 聊天和 TTS）
- **Gemini API Key**（用于视频视觉分析）

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/kb330/VStandby-Studio.git
   cd VStandby-Studio
   ```

2. **安装前端依赖**
   ```bash
   npm install
   ```

3. **创建 Python 虚拟环境并安装后端依赖**
   ```bash
   python -m venv .venv

   # macOS / Linux
   source .venv/bin/activate

   # Windows
   .venv\Scripts\activate

   pip install -r requirements.txt
   ```

4. **配置环境变量**

   创建 `.env.local` 文件并填入你的 API Key：
   ```env
   GEMINI_API_KEY="你的-Gemini-API-Key"
   OPENAI_API_KEY="你的-OpenAI-API-Key"
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```
   此命令会通过 `concurrently` 同时启动：
   - 后端：`uvicorn` 监听 `8000` 端口
   - 前端：`Vite` 监听 `3000` 端口，自动代理 `/api/*` 请求到后端

6. **打开浏览器访问** `http://localhost:3000`

---

## 环境变量配置

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `OPENAI_API_KEY` | 是 | OpenAI API 密钥，用于 AI 聊天 (`gpt-4o-mini`) 和语音合成 (`tts-1`) |
| `GEMINI_API_KEY` | 是 | Google Gemini API 密钥，用于视频视觉分析 (`gemini-2.0-flash`) |
| `APP_URL` | 否 | 应用部署 URL（用于自引用链接） |

Vite 开发服务器额外配置：
- 端口：`3000`
- API 代理：`/api` → `http://127.0.0.1:8000`
- 可通过设置 `DISABLE_HMR=true` 禁用热模块替换（适用于 AI Studio 部署）

---

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动后端 + 前端开发服务器 |
| `npm run build` | 构建生产环境前端包 |
| `npm run preview` | 预览生产环境构建 |
| `npm run clean` | 清除 `dist/` 目录 |
| `npm run lint` | 运行 TypeScript 类型检查 (`tsc --noEmit`) |

---

## API 接口

后端运行在 `http://localhost:8000`，以下为主要端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ws/{sport}` | WebSocket | 实时比赛数据流。NBA 使用真实数据，CS2/LOL 使用模拟数据 |
| `/api/chat` | POST | AI 聊天（流式响应，支持人格选择） |
| `/api/chat/summary` | POST | 比赛 AI 全场总结（流式响应） |
| `/api/tts` | POST | 文字转语音（OpenAI `tts-1`，`nova` 音色） |
| `/api/vision/analyze` | POST | 上传视频进行 Gemini 视觉分析 |
| `/api/vision/demo/{sport}` | GET | 获取预缓存的演示视觉分析时间线 |
| `/api/games/historical` | GET | 获取历史比赛列表 |
| `/api/games/historical/{game_id}/playbyplay` | GET | 获取指定历史比赛的完整逐回合数据 |

---

## 关键模块详解

### useGameSimulation（比赛模拟 Hook）
- 管理比赛状态（球队、比分、时间、最近回合、兴奋度）
- 双模式运行：**实时模式**（WebSocket 连接后端）和 **历史回放模式**（定时播放精选时间线）
- 支持倍速控制（1x / 2x / 5x / 10x）、进度拖拽、播放/暂停
- WebSocket 断线自动重连（3 秒间隔）

### useAICompanion（AI 伴侣 Hook）
- 管理聊天消息、输入状态、人格切换
- 新回合到达时自动触发 AI 反应播报
- 流式接收后端响应
- 集成 TTS 播放，使用 AudioContext 分析器实现音频可视化
- 视频视觉分析：上传 → Gemini 逐帧分析 → 带时间戳评论与视频同步

### AIAvatarOrb（AI 光球组件）
- 基于 Canvas 的音频频率可视化动画
- AI 说话时显示动态音频波形
- 紫色渐变光晕效果

### 历史比赛数据
- 内置于 `backend/historical_games.py`，每场比赛包含 75 个回合、4 节完整数据
- 每个回合包含：比赛时间、节数、比分、描述、是否为精彩回合标记

---

## 许可证

本项目源文件采用 **Apache-2.0** 许可证。

```
SPDX-License-Identifier: Apache-2.0
```
