# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install frontend dependencies
npm install

# Set up Python virtual environment
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Start both backend (port 8000) and frontend (port 3000) concurrently
npm run dev

# Type-check TypeScript
npm run lint

# Production build
npm run build
```

## Environment Variables

Create `.env.local` in the project root:
```env
OPENAI_API_KEY="..."   # gpt-4o-mini chat + tts-1 voice
GEMINI_API_KEY="..."   # gemini-2.0-flash video analysis
```

## Architecture

**Full-stack real-time sports companion app.** The frontend is React 19 + TypeScript (Vite on port 3000); the backend is FastAPI/Python (uvicorn on port 8000). Vite proxies all `/api/*` requests to the backend, so the frontend never hard-codes the backend URL.

### Data Flow

```
NBA live data (nba_api, every 8s) ──► background_nba_task() ──► WebSocket broadcast
                                                                    ↓
                        useGameSimulation (React hook) ◄── /api/ws/{sport}
                                    ↓
                        useAICompanion (React hook)
                          ├─ auto-broadcast: /api/chat (isAutoBroadcast=true)
                          ├─ user chat:      /api/chat
                          ├─ TTS:            /api/tts  → AudioContext analyzer
                          └─ vision:         /api/vision/analyze (Gemini)
```

### Key Design Points

- **`useGameSimulation`** — dual-mode hook. In `live` mode it maintains a WebSocket with 3s auto-reconnect. In `historical` mode it ticks through `PlayByPlayEvent[]` from `/api/games/historical/{id}/playbyplay` at a configurable interval (`6000ms / playbackSpeed`). Both modes produce the same `GameContext` shape so consumers are mode-agnostic.

- **`useAICompanion`** — watches `gameContext.lastPlay` and fires auto-broadcasts on change, subject to a cooldown (8s live, 5s historical). TTS uses a single `AudioContext`/`AnalyserNode` pair that drives `AIAvatarOrb`'s canvas animation. Vision analysis uploads a file to Gemini via the backend, then stores a `{timestamp, comment}[]` timeline; `syncVision(currentTime)` triggers comments as video playback progresses.

- **`backend/main.py`** — single-file backend. NBA data is polled in a background asyncio task (`background_nba_task`) that writes to a module-level `global_game_state` dict, then broadcasts to all connected WebSocket clients. CS2/LOL return static mock states. Google Genai SDK is imported lazily inside the `/api/vision/analyze` endpoint to avoid startup cost.

- **`backend/historical_games.py`** — pure data module. Each game has ~75 play-by-play entries with `clock`, `quarter`, `score`, `desc`, and `isHighlight` fields. The `HISTORICAL_GAMES_METADATA` list and `HISTORICAL_GAMES_TIMELINES` dict are the only exports consumed by the API.

- **AI personas** — `analyst`, `trash_talker`, `emotional` — are string-keyed prompt templates applied consistently across `/api/chat`, `/api/chat/summary`, and `/api/vision/analyze`. The persona is passed from frontend state on every request.

- **Vite proxy** — `vite.config.ts` proxies `/api` to `http://127.0.0.1:8000`. Set `DISABLE_HMR=true` to disable hot-module replacement (used in AI Studio deployments).
