# Merge Notes — `new_avators` branch

面向组内合并：本分支在 **`white-background`** 基础上扩展 **多 Avatar、TTS 声线、对话记录与模拟语音管线**。合并前请通读本节并跑一次前后端。

## 分支与基线

| 项 | 说明 |
|----|------|
| **分支名** | `new_avators`（按需求命名；合并后可按需改名） |
| **建议基线** | `origin/white-background`（本分支在拉取远端后的 `white-background` 上创建，已并入上游 **字幕调试面板** `Temporary Debug Panel` 与 `live_subtract/` 目录） |

## 环境 / 启动

- 根目录 `.env.local`：`OPENAI_API_KEY`（TTS + 可选 `gpt-4o-mini-tts`）、`SPATIALREAL_*`、`VITE_SPATIALREAL_APP_ID` 等见 `CLAUDE.md`。
- **TTS 模型（可选）**：`OPENAI_TTS_MODEL` 未设置时后端默认 `gpt-4o-mini-tts`；若账号不支持会自动降级 `tts-1-hd` → `tts-1`。
- 启动：`npm run dev`（后端 8000 + 前端 3000）。

## 功能一览（给 Code Review）

### 1. 多 Avatar 与声线配置（前后端）

- **`src/config/avatarVoiceProfiles.ts`**（单一数据源）  
  - `DEFAULT_SPATIALREAL_AVATAR_ID`、下拉 `AVATAR_SELECTOR_OPTIONS`、`AVATAR_VOICE_MAP`（`label` + `style`：`british_male` / `female_soft` / `child_energetic`）、`getVoiceProfileForAvatarId()`。
- **`src/components/YouTubeLiveCompanionDemo.tsx`**  
  - `avatarId` state + 下拉；`currentVoice = useMemo(...)`；`Voice: …` 轻提示；`AnimatePresence` 切换淡入淡出；向 `SpatialRealAvatar` 传 `avatarId`、`voiceProfile`。  
  - **与上游合并**：保留 `sendSubtitleToAgent`、`subtitleDebugRows`、`Temporary Debug Panel`（`/api/pipeline/react` 字幕测试）。
- **`src/components/SpatialRealAvatar.tsx`**  
  - `avatarId` 驱动 `AvatarManager.shared.load(avatarId)`（effect 依赖 `[avatarId]`）；`/api/tts` 请求体含 `text`、`avatarId`、`voiceStyle`；`avatarIdRef` / `voiceProfileRef` 避免异步陈旧闭包。  
  - **未改** `controller.send` / `start` 的 SDK 语义，仅增加可选回调与停播逻辑。

### 2. 后端 `/api/tts`（`backend/main.py`）

- 按 **`avatarId`（UUID）** 主键、`voiceStyle` 为辅解析 **OpenAI `voice` + `speed` + `instructions`**（`gpt-4o-mini-tts` 时使用 `instructions` 强化英音 / 女声 / 男童气质）。
- UUID 与前端 `avatarVoiceProfiles.ts` 保持一致；未知 id 回退 Shakespeare 配置。

### 3. Companion 侧 TTS 对齐

- **`src/hooks/useAICompanion.ts`**：`/api/tts` 除 `text` 外补充 **`avatarId` + `voiceStyle`**（默认 Shakespeare），避免 Demo 里 Companion 语音与 Avatar 配置脱节。

### 4. 麦克风模拟对话（占位 STT → 规则回复）

- **`src/lib/mockVoiceDialogue.ts`**：约 10 组中英触发语 + `resolveMockVoiceReply()`；后续可替换为真实 LLM。
- **`SpatialRealAvatar`**：`SpeechRecognition` 结果 → `resolveMockVoiceReply` → 原 TTS → PCM/HTML Audio 流程。

### 5. 单轨播放与打断

- **`SpatialRealAvatar`**：`stopAllAvatarOutput`、fallback `Audio` 单实例、`AbortController` 取消进行中的 TTS、`speakSeq` 防竞态；`recognition.onerror` 忽略 `aborted`。

### 6. 对话状态与 LLM 预留

- **`src/lib/conversationPipeline.ts`**：`ConversationTurn`、`generateAIResponse(..., _avatarContext?)` 占位 + persona TODO 注释。
- **`YouTubeLiveCompanionDemo`**：`conversation` state、`handleUserSpeech` / `handleAssistantResponse`、通过 `SpatialRealAvatar` 的 `onUserSpeechCaptured` / `onAssistantUtterance` 写入；底部最近 3 条预览；`useEffect` 打 `console.log`。

## 合并时建议自测清单

1. 首页 YouTube Demo：切换 **Shakespeare / Mia / Little Tommy**，各说一两句，确认 **音色差异** 与控制台无报错。  
2. 若有 **InteractiveDemo + useAICompanion**：发一条带 TTS 的消息，确认仍为默认 Shakespeare 声线且请求成功。  
3. **SpatialReal 连接失败** 降级 HTML Audio：仍应单轨、可打断。  
4. 后端日志：应出现 `tts ok model=... avatar=... voice=...` 类 info（视 logging 配置）。

## 已知限制 / 后续 TODO

- **真 STT / 真 LLM**：仍为占位或 TODO；接入后需把 `reply` 接到 Avatar 说话入口（可能要暴露 `speakText` 或 ref）。
- **SpatialReal 双路声音**：若仍感觉「叠轨」，需查 SDK/控制台是否另有默认音频流（本仓库未改 `SpatialRealAvatar` 内 SDK 初始化链以外的黑盒行为）。

## 主要改动文件列表

```
backend/main.py
src/config/avatarVoiceProfiles.ts          (new)
src/lib/mockVoiceDialogue.ts               (new)
src/lib/conversationPipeline.ts            (new)
src/components/SpatialRealAvatar.tsx
src/components/YouTubeLiveCompanionDemo.tsx
src/hooks/useAICompanion.ts
MERGE_NOTES.md                             (new, 本说明)
live_subtract/                             (来自上游 white-background)
```

---

**PR 标题建议**：`feat: multi-avatar SpatialReal + TTS voice profiles + conversation stub (new_avators)`
