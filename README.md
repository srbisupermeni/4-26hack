<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# VStandby Studio

**AI-powered real-time sports and esports co-viewing companion**

VStandby Studio is a live AI companion for people watching NBA, CS2, League of Legends, and more. The AI sits beside you with reactions, insight, calls, and scene-aware commentary—like a friend who actually watches the same feed.

> View in AI Studio: https://ai.studio/apps/b195854f-4162-468d-946e-22cadeee0a33

---

## Contents

- [Features](#features)
- [Stack](#stack)
- [Project layout](#project-layout)
- [Quick start](#quick-start)
- [Environment](#environment)
- [Scripts](#scripts)
- [API](#api)
- [Key modules](#key-modules)
- [License](#license)

---

## Features

### Live game tracking
- Real NBA data via `nba_api`, pushed over WebSocket about every 8s
- Multi–sport: NBA (live), CS2 and LoL (simulated)
- YouTube embeds for demo playback

### AI companion chat
- OpenAI `gpt-4o-mini` conversations
- Personas: **Analyst**, **Trash Talker**, **Emotional fan**
- Auto-reactions on play changes (8s cooldown live, 5s in replay)

### Text-to-speech
- OpenAI `tts-1` (e.g. `nova` voice) with optional per-avatar routing via `/api/tts`
- One-click read-aloud with audio-reactive orb visuals

### Historical replays
- Full play-by-play timelines for classic games
- 1x / 2x / 5x / 10x speed, scrub, pause
- Post-game AI summary

### Video vision
- Upload clips; Google Gemini (`gemini-2.0-flash`) returns timestamped comments
- Demo cached timelines for LoL / NBA

### Marketing / demo shell
- Hero, feature grid, interactive demos, and pipeline tooling where enabled

---

## Stack

### Frontend
| Tech | Version | Role |
|------|---------|------|
| React | 19 | UI |
| TypeScript | 5.8 | Types |
| Vite | 6 | Build & dev server |
| Tailwind CSS | 4 | Styling |
| Motion | 12+ | Animation |
| Lucide React | — | Icons |

### Backend
| Tech | Role |
|------|------|
| Python 3 | API |
| FastAPI | Web framework |
| Uvicorn | ASGI |
| OpenAI SDK | Chat & TTS |
| Google Genai SDK | Gemini vision |
| nba_api | NBA data |
| WebSocket | Live streams |

---

## Project layout

```
├── .env.example
├── .gitignore
├── README.md
├── metadata.json
├── package.json
├── requirements.txt
├── tsconfig.json
├── vite.config.ts
├── index.html
├── backend/
│   ├── main.py
│   └── historical_games.py
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── lib/
│   ├── hooks/
│   └── components/
├── public/
└── test_*.py
```

---

## Quick start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Python** 3.10+
- **OpenAI API key** (chat + TTS)
- **Gemini API key** (vision)

### Install

1. **Clone**
   ```bash
   git clone https://github.com/srbisupermeni/4-26hack.git
   cd 4-26hack
   ```

2. **Frontend**
   ```bash
   npm install
   ```

3. **Python**
   ```bash
   python -m venv .venv
   source .venv/bin/activate   # macOS / Linux
   # .venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

4. **Environment**

   Create `.env.local`:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   OPENAI_API_KEY="your-openai-api-key"
   ```

5. **Run**
   ```bash
   npm run dev
   ```
   Starts `uvicorn` on **8000** and Vite on **3000** with `/api` proxied to the backend.

6. Open **http://localhost:3000**

---

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | Chat (`gpt-4o-mini`) and TTS |
| `GEMINI_API_KEY` | Yes | Video vision (`gemini-2.0-flash`) |
| `APP_URL` | No | Self-referential links when deployed |

Vite dev server: port **3000**, proxy `/api` → `http://127.0.0.1:8000`. Set `DISABLE_HMR=true` to disable HMR (e.g. AI Studio).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend + frontend dev |
| `npm run build` | Production frontend build |
| `npm run preview` | Preview build |
| `npm run clean` | Remove `dist/` |
| `npm run lint` | `tsc --noEmit` |

---

## API

Base URL: `http://localhost:8000`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ws/{sport}` | WebSocket | Live game feed (real NBA, sim CS2/LoL) |
| `/api/chat` | POST | Streaming chat with persona |
| `/api/pipeline/react` | POST | Pipeline adapter (structured input + output) |
| `/api/chat/summary` | POST | End-of-game summary (stream) |
| `/api/tts` | POST | TTS (per-avatar routing when configured) |
| `/api/vision/analyze` | POST | Video analysis |
| `/api/vision/demo/{sport}` | GET | Demo vision timeline |
| `/api/games/historical` | GET | Historical game list |
| `/api/games/historical/{game_id}/playbyplay` | GET | Play-by-play timeline |

---

## Key modules

### `useGameSimulation`
- Game state: teams, score, clock, last play, excitement
- **Live** (WebSocket) and **replay** (timeline) modes
- Speed, seek, pause; WebSocket reconnect every 3s

### `useAICompanion`
- Messages, typing, persona
- Auto-broadcasts on new plays; streaming API responses
- TTS + `AudioContext` visualization
- Optional vision: upload → Gemini → timestamped comments

### `AIAvatarOrb`
- Canvas audio visualization, purple glow

### Historical data
- `backend/historical_games.py`: full games with plays and highlight flags

---

## License

Source files in this project use **Apache-2.0**.

```
SPDX-License-Identifier: Apache-2.0
```
