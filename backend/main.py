import os
import random
import asyncio
import logging
import subprocess
import sys
import time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
# from google import genai (Moved to lazy loading inside endpoint)
from openai import AsyncOpenAI
from nba_api.stats.endpoints import scoreboardv2, playbyplayv2, leaguegamefinder
from dotenv import load_dotenv

try:
    import historical_games
    from motion_frames import extract_motion_frames
except ImportError:
    from . import historical_games
    from .motion_frames import extract_motion_frames

load_dotenv('.env.local')
load_dotenv()

log = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State & Caching
global_game_state = {
    "teams": "Connecting...",
    "score": "0 - 0",
    "clock": "00:00",
    "lastPlay": "System starting...",
    "excitement": 0.5,
    "isReplay": False,
    "videoUrl": None
}

connected_clients = set()

subtitle_clients: set[WebSocket] = set()
subtitle_history: list[dict] = []
SUBTITLE_HISTORY_LIMIT = 20

highlight_clients: set[WebSocket] = set()
highlight_history: list[dict] = []
HIGHLIGHT_HISTORY_LIMIT = 20

# Mirrors USER_DELAY_SECONDS in src/components/YouTubeLiveCompanionDemo.tsx.
# Used to compute the WS `deliverAfterMs` budget so the avatar speaks exactly
# when the user's delayed playback reaches the highlight moment.
USER_DELAY_SECONDS = 5.0

LIVE_SUBTRACT_STATE: dict[str, object] = {"proc": None, "url": None}
LIVE_SUBTRACT_SCRIPT = Path(__file__).resolve().parent.parent / "live_subtract" / "live_subtract.py"

LIVE_HIGHLIGHT_STATE: dict[str, object] = {"proc": None, "url": None}
LIVE_HIGHLIGHT_SCRIPT = Path(__file__).resolve().parent.parent / "live_subtract" / "highlight_detect.py"


def _stop_proc(state: dict[str, object]) -> None:
    proc = state.get("proc")
    if isinstance(proc, subprocess.Popen) and proc.poll() is None:
        try:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass
    state["proc"] = None
    state["url"] = None


def _stop_live_subtract():
    _stop_proc(LIVE_SUBTRACT_STATE)


def _stop_live_highlight():
    _stop_proc(LIVE_HIGHLIGHT_STATE)

MOCK_SPORTS_STATES = {
    "lol": {
        "teams": "T1 vs TES",
        "score": "Kills: 13 - 10",
        "clock": "24:15",
        "lastPlay": "Zeus relies on the fog of war and hides in the bot lane brush, Meiko is searching for him!",
        "excitement": 0.8,
        "isReplay": False,
        "videoUrl": None
    },
    "cs2": {
        "teams": "FaZe vs NAVI",
        "score": "Rounds: 11 - 9",
        "clock": "Round 21",
        "lastPlay": "broky gets an opening pick with the AWP.",
        "excitement": 0.7,
        "isReplay": False,
        "videoUrl": None
    }
}

# Pre-mapped Video Dataset placeholders 
# (These represent the clips we would download in nba_pbp_video_dataset)
VIDEO_DATASET_MAP = {
    "3PT": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "BLOCK": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "DUNK": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    "FOUL": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "STEAL": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "DEFAULT": None # Reverts to YouTube static iframe fallback
}

def analyze_play_for_video(play_desc: str) -> str:
    """Matches text description to a specific video clip from our dataset."""
    desc = play_desc.upper()
    if "3PT" in desc or "THREE" in desc:
        return VIDEO_DATASET_MAP["3PT"]
    if "BLOCK" in desc:
        return VIDEO_DATASET_MAP["BLOCK"]
    if "DUNK" in desc or "PUTBACK" in desc:
        return VIDEO_DATASET_MAP["DUNK"]
    if "FOUL" in desc:
        return VIDEO_DATASET_MAP["FOUL"]
    if "STEAL" in desc or "TURNOVER" in desc:
        return VIDEO_DATASET_MAP["STEAL"]
    return VIDEO_DATASET_MAP["DEFAULT"]

replay_mock_index = 0

def fetch_nba_data():
    global replay_mock_index
    try:
        from datetime import datetime
        sb = scoreboardv2.ScoreboardV2()
        sb_dict = sb.get_dict()
        games = sb_dict['resultSets'][0]['rowSet']
        header = sb_dict['resultSets'][0]['headers']
        
        status_idx = header.index("GAME_STATUS_ID")
        game_id_idx = header.index("GAME_ID")
        
        live_games = [g for g in games if g[status_idx] == 2]
        
        selected_game = None
        is_replay = False
        teams_str = "NBA Teams"
        game_id = "0000000"
        s = "0 - 0"
        
        if live_games:
            selected_game = live_games[0]
            game_id = selected_game[game_id_idx]
            
            line_score = sb_dict['resultSets'][1]['rowSet']
            ls_headers = sb_dict['resultSets'][1]['headers']
            team_abbr_idx = ls_headers.index("TEAM_ABBREVIATION")
            game_id_ls_idx = ls_headers.index("GAME_ID")
            pts_idx = ls_headers.index("PTS")
            
            game_teams = [t for t in line_score if t[game_id_ls_idx] == game_id]
            if len(game_teams) >= 2:
                teams_str = f"{game_teams[0][team_abbr_idx]} vs {game_teams[1][team_abbr_idx]}"
                s = f"{game_teams[0][pts_idx] or 0} - {game_teams[1][pts_idx] or 0}"
        else:
            is_replay = True
            gf = leaguegamefinder.LeagueGameFinder()
            gf_games = gf.get_dict()['resultSets'][0]['rowSet']
            gf_headers = gf.get_dict()['resultSets'][0]['headers']
            
            matchup_idx = gf_headers.index("MATCHUP")
            pts_idx = gf_headers.index("PTS")
            gf_game_id_idx = gf_headers.index("GAME_ID")
            
            recent = gf_games[0]
            game_id = recent[gf_game_id_idx]
            teams_str = recent[matchup_idx]
            # Add dynamic variance to score so it feels "live" in rehearsal mode
            lakers_pts, opp_pts = (recent[pts_idx] or 90), random.randint(85, 120)
            s = f"{lakers_pts} - {opp_pts}" 
        
        q = "Q4"
        c = "00:00"
        desc = "Game finished."
        
        try:
            # We enforce a small timeout to not hang the worker
            pbp = playbyplayv2.PlayByPlayV2(game_id=game_id, timeout=3)
            pbp_data = pbp.get_dict()['resultSets'][0]['rowSet']
            pbp_headers = pbp.get_dict()['resultSets'][0]['headers']
            
            desc_idx = pbp_headers.index("HOMEDESCRIPTION")
            visit_desc_idx = pbp_headers.index("VISITORDESCRIPTION")
            neutral_desc_idx = pbp_headers.index("NEUTRALDESCRIPTION")
            score_idx = pbp_headers.index("SCORE")
            clock_idx = pbp_headers.index("PCTIMESTRING")
            period_idx = pbp_headers.index("PERIOD")
            
            plays = [p for p in pbp_data if p[desc_idx] or p[visit_desc_idx] or p[neutral_desc_idx]]
            
            # Since this is a live mock, we systematically progress through plays
            if is_replay and plays:
                # Modulo by length in case we reach the end of the game
                recent_play = plays[replay_mock_index % len(plays)]
                replay_mock_index += 1
            else:
                recent_play = plays[-1] if plays else None
            
            if recent_play:
                q = f"Q{recent_play[period_idx]}"
                c = recent_play[clock_idx]
                s = recent_play[score_idx] or s
                desc = recent_play[desc_idx] or recent_play[visit_desc_idx] or recent_play[neutral_desc_idx] or "Game starting."
        except Exception:
            mock_plays = [
                f"{teams_str.split(' ')[0]} hits a spectacular three pointer!",
                f"Amazing defensive block down the stretch.",
                f"Sloppy turnover causes a fast break the other way.",
                f"Drives to the basket and draws the foul!",
                f"Huge putback dunk!"
            ]
            desc = random.choice(mock_plays)
            
        if is_replay:
            desc = "[Replay - Currently No Game] " + str(desc)

        s = s.replace(" - ", "-").replace("-", " - ")

        # Match video dataset!
        matched_video = analyze_play_for_video(desc)

        return {
            "teams": teams_str,
            "score": s,
            "clock": f"{c} {q}",
            "lastPlay": desc,
            "excitement": random.uniform(0.6, 0.95),
            "isReplay": is_replay,
            "videoUrl": matched_video
        }
    except Exception as e:
        print("Scraper Error:", e)
        return None

async def update_global_nba_state():
    """Background polling worker similar to nba-live-tracker logic."""
    global global_game_state
    
    new_state = await asyncio.to_thread(fetch_nba_data)
    if new_state:
        global_game_state = new_state

async def background_nba_task():
    """Background loop pushing real-time tracking data directly to websockets"""
    while True:
        await update_global_nba_state()
        
        # Broadcast immediately to all listening clients!
        dead_clients = set()
        for client in connected_clients:
            try:
                await client.send_json(global_game_state)
            except WebSocketDisconnect:
                dead_clients.add(client)
            except Exception:
                dead_clients.add(client)
        
        connected_clients.difference_update(dead_clients)
        
        # Avoid NBA Rate limits using asyncio sleep (simulating asyncio Lock in tracker)
        await asyncio.sleep(8)

@app.on_event("startup")
async def startup_event():
    # Trigger background poller on boot seamlessly
    asyncio.create_task(background_nba_task())

@app.websocket("/api/ws/subtitles")
async def websocket_subtitles_endpoint(websocket: WebSocket):
    """Stream subtitle lines to every connected browser as they arrive."""
    await websocket.accept()
    subtitle_clients.add(websocket)
    try:
        for entry in subtitle_history[-SUBTITLE_HISTORY_LIMIT:]:
            await websocket.send_json(entry)

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        subtitle_clients.discard(websocket)


def _spawn_worker(
    script_path: Path,
    extra_args: list[str],
    log_filename: str,
    state: dict[str, object],
    url: str,
) -> subprocess.Popen:
    log_dir = script_path.parent
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / log_filename

    log_file = open(log_path, "ab", buffering=0)
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    cmd = [sys.executable, "-u", str(script_path), url, *extra_args]
    process = subprocess.Popen(
        cmd,
        stdout=log_file,
        stderr=log_file,
        cwd=str(script_path.parent.parent),
        env=env,
    )
    state["proc"] = process
    state["url"] = url
    return process


_VALID_PERSONAS = ("analyst", "trash_talker", "emotional")


def _normalize_persona(value: object) -> str:
    text = str(value or "").strip()
    return text if text in _VALID_PERSONAS else "analyst"


@app.post("/api/subtitles/start")
async def start_subtitle_worker(request: Request):
    """Spawn live_subtract + highlight_detect workers for the given live URL.

    The browser calls this once on connect; we replace any prior workers so
    the user only sees data for the latest URL. The optional `persona` field
    is forwarded to both workers so the autonomous OpenCV-driven avatar lines
    match whichever channel (sports / drama / kids) the user is in.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    url = (data.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")

    if not LIVE_SUBTRACT_SCRIPT.exists():
        raise HTTPException(status_code=500, detail=f"live_subtract script missing at {LIVE_SUBTRACT_SCRIPT}")

    persona = _normalize_persona(data.get("persona"))
    sport = (data.get("sport") or "NBA").strip() or "NBA"

    _stop_live_subtract()
    sub_proc = _spawn_worker(
        script_path=LIVE_SUBTRACT_SCRIPT,
        extra_args=[
            "--agent-url",
            "http://127.0.0.1:8000/api/subtitles",
            "--persona",
            persona,
            "--sport",
            sport,
        ],
        log_filename="live_subtract.runtime.log",
        state=LIVE_SUBTRACT_STATE,
        url=url,
    )

    # Best-effort: also kick off the OpenCV highlight worker. Failures here
    # should not block the subtitle pipeline.
    highlight_pid: int | None = None
    if LIVE_HIGHLIGHT_SCRIPT.exists():
        try:
            _stop_live_highlight()
            hl_proc = _spawn_worker(
                script_path=LIVE_HIGHLIGHT_SCRIPT,
                extra_args=[
                    "--agent-url",
                    "http://127.0.0.1:8000/api/highlights",
                    "--persona",
                    persona,
                    "--sport",
                    sport,
                ],
                log_filename="highlight_detect.runtime.log",
                state=LIVE_HIGHLIGHT_STATE,
                url=url,
            )
            highlight_pid = hl_proc.pid
        except Exception as exc:
            print(f"highlight worker failed to start: {exc}")

    return {
        "status": "started",
        "url": url,
        "persona": persona,
        "sport": sport,
        "pid": sub_proc.pid,
        "log": str(LIVE_SUBTRACT_SCRIPT.parent / "live_subtract.runtime.log"),
        "highlightPid": highlight_pid,
    }


@app.post("/api/subtitles/stop")
async def stop_subtitle_worker():
    _stop_live_subtract()
    _stop_live_highlight()
    return {"status": "stopped"}


@app.get("/api/subtitles/status")
async def subtitle_worker_status():
    sub_proc = LIVE_SUBTRACT_STATE.get("proc")
    sub_running = isinstance(sub_proc, subprocess.Popen) and sub_proc.poll() is None
    hl_proc = LIVE_HIGHLIGHT_STATE.get("proc")
    hl_running = isinstance(hl_proc, subprocess.Popen) and hl_proc.poll() is None
    return {
        "running": sub_running,
        "url": LIVE_SUBTRACT_STATE.get("url") if sub_running else None,
        "pid": sub_proc.pid if sub_running else None,
        "highlight": {
            "running": hl_running,
            "url": LIVE_HIGHLIGHT_STATE.get("url") if hl_running else None,
            "pid": hl_proc.pid if hl_running else None,
        },
    }


@app.websocket("/api/ws/highlights")
async def websocket_highlights_endpoint(websocket: WebSocket):
    """Stream OpenCV highlight reactions to every connected browser as they arrive."""
    await websocket.accept()
    highlight_clients.add(websocket)
    try:
        for entry in highlight_history[-HIGHLIGHT_HISTORY_LIMIT:]:
            await websocket.send_json(entry)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        highlight_clients.discard(websocket)


_HIGHLIGHT_PERSONA_PROMPTS = {
    "analyst": "You are a calm, sharp sports analyst.",
    "trash_talker": "You are a sarcastic trash-talking sports companion.",
    "emotional": "You are an over-the-top passionate sports superfan.",
}


async def _generate_highlight_reaction(
    motion_ratio: float,
    active_sport: str,
    persona: str,
    recent_subtitles: list[str],
) -> str:
    """Ask the LLM for a 1-sentence reaction to a detected highlight.

    Falls back to a canned line if no API key is configured / the call fails.
    The OpenCV worker only knows "lots of motion happened" so we lean on the
    most recent live subtitle for context.
    """
    fallback = "Whoa — did you see that?!"
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return fallback

    persona_prompt = _HIGHLIGHT_PERSONA_PROMPTS.get(persona, _HIGHLIGHT_PERSONA_PROMPTS["analyst"])
    subtitle_excerpt = " | ".join(recent_subtitles[-3:]).strip()

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"{persona_prompt} You are a live AI companion sitting next to the user "
                        f"watching {active_sport}. Our OpenCV pipeline just flagged a high-motion "
                        "moment as a likely highlight. Reply in exactly ONE punchy sentence — no "
                        "preamble, no greeting. Treat it as if it's happening right now."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Motion intensity: {motion_ratio:.2f}.\n"
                        f"Most recent commentary: {subtitle_excerpt or '(no commentary captured)'}\n"
                        "React now."
                    ),
                },
            ],
            timeout=8.0,
            max_tokens=80,
            temperature=0.8,
        )
        text = (response.choices[0].message.content or "").strip()
        return text or fallback
    except Exception as exc:
        print(f"highlight LLM error: {exc}")
        return fallback


@app.post("/api/highlights")
async def push_highlight(request: Request):
    """Worker-facing endpoint.

    OpenCV side POSTs `{timestamp, motionRatio, activeSport, persona}` whenever
    it detects a highlight. We:
      1. Run the LLM to produce a short avatar line.
      2. Compute `deliverAfterMs` = USER_DELAY_SECONDS - (LLM elapsed) so the
         frontend can fire `avatar.speak(...)` right when the user's delayed
         playback reaches the highlighted moment.
      3. Broadcast over /api/ws/highlights so any browser tab can pick it up.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    detected_at = float(payload.get("timestamp") or time.time())
    try:
        motion_ratio = float(payload.get("motionRatio") or 0.0)
    except (TypeError, ValueError):
        motion_ratio = 0.0
    active_sport = (payload.get("activeSport") or "NBA").strip() or "NBA"
    persona = (payload.get("persona") or "analyst").strip() or "analyst"

    recent_subtitles = [entry.get("text", "") for entry in subtitle_history if entry.get("text")]
    text = await _generate_highlight_reaction(
        motion_ratio=motion_ratio,
        active_sport=active_sport,
        persona=persona,
        recent_subtitles=recent_subtitles,
    )

    elapsed = max(0.0, time.time() - detected_at)
    deliver_after_ms = max(0, int((USER_DELAY_SECONDS - elapsed) * 1000))

    entry = {
        "type": "highlight_reaction",
        "detectedAt": detected_at,
        "deliverAfterMs": deliver_after_ms,
        "motionRatio": motion_ratio,
        "activeSport": active_sport,
        "persona": persona,
        "text": text,
        "timestamp": time.strftime("%H:%M:%S"),
        "subtitleSnapshot": recent_subtitles[-3:],
    }
    highlight_history.append(entry)
    if len(highlight_history) > HIGHLIGHT_HISTORY_LIMIT:
        del highlight_history[: len(highlight_history) - HIGHLIGHT_HISTORY_LIMIT]

    dead: set[WebSocket] = set()
    for client in highlight_clients:
        try:
            await client.send_json(entry)
        except WebSocketDisconnect:
            dead.add(client)
        except Exception:
            dead.add(client)
    highlight_clients.difference_update(dead)

    return {"status": "ok", "delivered": len(highlight_clients), "entry": entry}


@app.post("/api/subtitles")
async def push_subtitle(request: Request):
    """Receive a subtitle line from any source and broadcast it to browser clients."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    text = (payload.get("text") or "").strip()
    if not text:
        return {"status": "ignored", "reason": "empty text"}

    source = (payload.get("source") or "external").strip() or "external"
    timestamp = payload.get("timestamp")
    if not isinstance(timestamp, str) or not timestamp:
        timestamp = time.strftime("%H:%M:%S")

    entry = {"text": text, "source": source, "timestamp": timestamp}
    subtitle_history.append(entry)
    if len(subtitle_history) > SUBTITLE_HISTORY_LIMIT:
        del subtitle_history[: len(subtitle_history) - SUBTITLE_HISTORY_LIMIT]

    dead_clients: set[WebSocket] = set()
    for client in subtitle_clients:
        try:
            await client.send_json(entry)
        except WebSocketDisconnect:
            dead_clients.add(client)
        except Exception:
            dead_clients.add(client)
    subtitle_clients.difference_update(dead_clients)

    return {"status": "ok", "delivered": len(subtitle_clients), "entry": entry}


@app.websocket("/api/ws/{sport}")
async def websocket_sport_endpoint(websocket: WebSocket, sport: str):
    """Real-time data stream!"""
    await websocket.accept()
    sport_lower = sport.lower()
    
    if sport_lower != "nba":
        mock_data = MOCK_SPORTS_STATES.get(sport_lower, MOCK_SPORTS_STATES["lol"])
        await websocket.send_json(mock_data)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        return

    connected_clients.add(websocket)
    try:
        # Instantly send cached global state with 0ms latency upon connection
        await websocket.send_json(global_game_state)
        
        # Keep web-socket alive and listening for client disconnects
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

@app.get("/api/vision/demo/{sport}")
async def get_vision_demo(sport: str):
    if sport.lower() == "lol":
        return {
            "timeline": [
                { "timestamp": 2, "comment": "This is the classic T1 vs TES match. Keep an eye on Zeus." },
                { "timestamp": 8, "comment": "Zeus is playing mind games here, retreating into the bot lane brush to use the fog of war." },
                { "timestamp": 15, "comment": "Meiko is checking the area but doesn't have vision in that specific spot!" },
                { "timestamp": 22, "comment": "Incredible use of the fog of war by Zeus. Meiko completely misses him!" }
            ],
            "message": "I've just refreshed my memory on this demo clip. I'll point out the key plays as we watch!"
        }
    else:
        return {
            "timeline": [
                { "timestamp": 5, "comment": "I remember this play! Steph Curry is about to split the defense here." },
                { "timestamp": 15, "comment": "Classic Warriors ball movement. Look at how Klay Thompson finds the space." },
                { "timestamp": 35, "comment": "And there's the splash! You can't leave him open from that distance." },
                { "timestamp": 60, "comment": "Transition defense from Cleveland was slightly late there." }
            ],
            "message": "I've just refreshed my memory on this demo clip. I'll point out the key plays as we watch!"
        }

@app.get("/api/games/historical")
async def get_historical_games():
    """Return the list of curated classic matches for simulation."""
    return {"games": historical_games.HISTORICAL_GAMES_METADATA}

@app.get("/api/games/historical/{game_id}/playbyplay")
async def get_historical_pbp(game_id: str):
    """Return the entire chronological timeline array of the game."""
    timeline = historical_games.HISTORICAL_GAMES_TIMELINES.get(game_id)
    if not timeline:
        return Response(status_code=404, content="Game not found")
    return {"plays": timeline}

@app.post("/api/pipeline/react")
async def pipeline_react(request: Request):
    """Stable adapter for the hackathon pipeline.

    The endpoint intentionally separates the input-understanding result from
    the output model result so the two model owners can replace either side
    without changing the webpage contract.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    trigger_reason = data.get("triggerReason", "user_message")
    user_message = (data.get("userMessage") or "").strip()
    game_context = data.get("gameContext", {}) or {}
    active_sport = data.get("activeSport", "NBA")
    persona = data.get("persona", "analyst")
    frames = data.get("frames", []) or []
    chat_history = data.get("chatHistory", []) or []

    frame_count = min(len(frames), 3)
    score = game_context.get("score", "unknown")
    clock = game_context.get("clock", "unknown")
    last_play = game_context.get("lastPlay", "No play detected yet.")

    if user_message and frame_count:
        source = "hybrid"
    elif frame_count:
        source = "vision"
    elif trigger_reason == "score_change":
        source = "scoreboard"
    else:
        source = "text"

    tags = [str(active_sport).lower(), str(trigger_reason)]
    if frame_count:
        tags.append("frames")
    if game_context.get("isReplay"):
        tags.append("replay")
    if user_message:
        tags.append("user_prompt")

    if trigger_reason == "visual_event":
        summary = f"Detected a visual change from {frame_count} recent frame(s) while {active_sport} is playing."
    elif trigger_reason == "score_change":
        summary = f"Scoreboard changed to {score}; latest play is: {last_play}"
    elif trigger_reason == "idle_break":
        summary = f"Viewer has been quiet; use the current {active_sport} context to make a light observation."
    elif user_message:
        summary = f"User asked: {user_message}"
    else:
        summary = f"Use the current {active_sport} game context to react naturally."

    input_result = {
        "source": source,
        "eventType": trigger_reason,
        "summary": summary,
        "confidence": 0.86 if frame_count or trigger_reason == "score_change" else 0.72,
        "tags": tags,
        "signals": [
            f"score={score}",
            f"clock={clock}",
            f"last_play={last_play}",
            f"frames={frame_count}",
        ],
    }

    base_prompts = {
        "analyst": "You are a calm, highly analytical AI sports companion.",
        "trash_talker": "You are a sarcastic trash-talking AI sports companion.",
        "emotional": "You are an overly passionate die-hard fan AI companion.",
    }
    persona_prompt = base_prompts.get(persona, base_prompts["analyst"])
    fallback_text = (
        f"I've got the handoff: {input_result['summary']} "
        f"That is the moment to watch right now."
    )
    output_model = "adapter:mock"

    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        try:
            history_excerpt = [
                {
                    "role": "assistant" if msg.get("role") == "ai" else "user",
                    "content": (msg.get("content") or "")[:300],
                }
                for msg in chat_history[-4:]
                if (msg.get("content") or "").strip()
            ]
            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"{persona_prompt} You are the output model in a two-stage "
                            "pipeline. React to the structured input result, not raw logs. "
                            "Keep it conversational, punchy, and at most 2 sentences."
                        ),
                    },
                    *history_excerpt,
                    {
                        "role": "user",
                        "content": (
                            f"Sport: {active_sport}\n"
                            f"Structured input: {input_result}\n"
                            f"User message: {user_message or 'No direct user prompt.'}"
                        ),
                    },
                ],
                timeout=10.0,
                max_tokens=120,
            )
            generated = response.choices[0].message.content
            if generated:
                fallback_text = generated.strip()
                output_model = "gpt-4o-mini via output-adapter"
        except Exception as e:
            fallback_text = f"{fallback_text} (Output adapter fallback: {str(e)[:60]}...)"

    return {
        "status": "complete",
        "input": input_result,
        "output": {
            "text": fallback_text,
            "model": output_model,
            "shouldSpeak": True,
        },
    }

@app.post("/api/chat/summary")
async def chat_summary(request: Request):
    """Provide a one-shot AI summary of the entire timeline."""
    try:
        data = await request.json()
        game_metadata = data.get("game", {})
        timeline = data.get("timeline", [])
        persona = data.get("persona", "analyst")
        
        base_prompts = {
            "analyst": "You are an analytical sports AI.",
            "trash_talker": "You are a toxic, extremely sarcastic, trash-talking AI sports companion.",
            "emotional": "You are an overly passionate, fan AI companion using ALL CAPS!"
        }
        
        persona_prompt = base_prompts.get(persona, base_prompts["analyst"])
        system_prompt = (
            f"{persona_prompt}\n"
            "The user is asking you for a concluding game summary of a historic match we just watched together.\n"
            f"Game: {game_metadata.get('title')}\n"
            f"Highlights: {', '.join([p['desc'] for p in timeline if p.get('isHighlight')])}\n"
            "Provide a robust, 3-4 sentence game outcome summary in your pure persona! Do not greet. Just react to the ending and wrap up the game!"
        )
        
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7,
        )
        
        async def generate_summary_stream():
            try:
                response_stream = await client.aio.models.generate_content_stream(
                    model="gemini-2.5-flash",
                    contents="Summarize the game.",
                    config=config,
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
            except Exception as e:
                yield f"Connection disrupted! ({str(e)[:80]}...)"
                
        return StreamingResponse(generate_summary_stream(), media_type="text/plain; charset=utf-8")
        
    except Exception as e:
        return Response(status_code=500, content=str(e))


@app.post("/api/chat")
async def chat(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
        
    user_message = data.get("userMessage", "")
    chat_history = data.get("chatHistory", [])
    is_auto = data.get("isAutoBroadcast", False)
    persona = data.get("persona", "analyst")
    active_sport = data.get("activeSport", "NBA")

    base_prompts = {
        "analyst": "You are a calm, highly analytical AI sports companion. Focus on stats, team efficiencies, tactical breakdowns, and strategy.",
        "trash_talker": "You are a toxic, extremely sarcastic, trash-talking AI sports companion. You aggressively roast players for mistakes, use heavy sports slang, and act arrogant.",
        "emotional": "You are an overly passionate, purely emotional die-hard fan AI companion. You frequently use ALL CAPS, exclamation marks, and scream/freak out over every play!"
    }
    
    persona_prompt = base_prompts.get(persona, base_prompts["analyst"])

    system_prompt = (
        f"{persona_prompt}\n"
        f"You are sitting next to the user watching the {active_sport} game together.\n"
        "If the user asks you questions or wants to chit-chat, respond naturally about ANY topic but strictly stay fully locked into your assigned persona. "
        "Keep responses very casual, punchy, and short (1 or 2 sentences max)."
    )

    if is_auto:
        system_prompt += f"\n\nYou are auto-reacting immediately to a new play. Keep it to exactly 1 short sentence staying entirely in your persona! Do NOT greet the user!"

    from google import genai
    from google.genai import types
    
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    contents = []
    
    # Add history
    for msg in chat_history:
        role = "model" if msg.get("role") == "ai" else "user"
        content_str = msg.get("content", "").strip()
        if content_str:
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=content_str)]))
            
    # Add the current message if not auto broadcast
    if user_message and not is_auto:
        if not chat_history or chat_history[-1].get("content") != user_message:
            contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))
            
    if is_auto and len(contents) == 0:
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text="[AUTO EVENT] React to the play")]))

    # Clean contents for Gemini rules
    cleaned_contents = []
    for c in contents:
        if cleaned_contents and cleaned_contents[-1].role == c.role:
            cleaned_contents[-1].parts.extend(c.parts)
        else:
            cleaned_contents.append(c)
    if cleaned_contents and cleaned_contents[0].role == "model":
        cleaned_contents.pop(0)
    if not cleaned_contents:
        cleaned_contents.append(types.Content(role="user", parts=[types.Part.from_text(text="Hello.")]))

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=150,
    )

    async def generate_stream():
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=cleaned_contents,
                config=config,
            )
            async for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            err_str = str(e)
            yield f"Connection disrupted! (System details: {err_str[:80]}...)"

    return StreamingResponse(generate_stream(), media_type="text/plain; charset=utf-8")

@app.post("/api/chat/vision")
async def chat_vision(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    user_message = data.get("userMessage", "") or ""
    chat_history = data.get("chatHistory", []) or []
    persona = data.get("persona", "analyst")
    active_sport = data.get("activeSport", "NBA")
    trigger_reason = data.get("triggerReason", "user_message")
    frames = data.get("frames", []) or []

    # Cap frames
    if len(frames) > 3:
        frames = frames[-3:]

    base_prompts = {
        "analyst": "You are a calm, highly analytical AI sports companion. Focus on stats, team efficiencies, tactical breakdowns, and strategy.",
        "trash_talker": "You are a toxic, extremely sarcastic, trash-talking AI sports companion. You aggressively roast players for mistakes, use heavy sports slang, and act arrogant.",
        "emotional": "You are an overly passionate, purely emotional die-hard fan AI companion. You frequently use ALL CAPS, exclamation marks, and scream/freak out over every play!"
    }
    persona_prompt = base_prompts.get(persona, base_prompts["analyst"])

    system_prompt = (
        f"{persona_prompt}\n"
        f"You are sitting next to the user watching a {active_sport} video closely.\n"
        "You rely PURELY on the visual frames provided to you. Do NOT hallucinate an invisible game score; just read the visuals.\n"
        "Look CAREFULLY at the UI elements (scores, player health bars, minimap, shot clock, kill feed, etc.), player movement, and specific events in the frames.\n"
        "Point out specific actions (e.g. 'He just missed the 3-pointer!' or 'That ultimate ability missed!') rather than giving generic hype.\n"
        "Ground your reactions in what's literally visible in the frames.\n"
        "Stay fully locked into your assigned persona. Keep responses punchy and short (1-2 sentences max). "
        "Talk like a friend on the couch, not a broadcaster. No greetings, no preamble."
    )

    if trigger_reason == "visual_event" or trigger_reason == "score_change":
        system_prompt += (
            "\n\nThe picture just changed significantly — react immediately to what you see "
            "in the most recent frame. 1 short sentence only, in pure persona."
        )
    elif trigger_reason == "idle_break":
        system_prompt += (
            "\n\nIt's been quiet for a while. Drop a light observation or question based on "
            "what's on screen — don't force hype if nothing's happening."
        )

    from google import genai
    from google.genai import types
    import base64

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    contents = []

    for msg in chat_history:
        role = "model" if msg.get("role") == "ai" else "user"
        content_str = (msg.get("content") or "").strip()
        if content_str:
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=content_str)]))

    user_parts = []
    
    prompt_text = user_message or "React to the current scene."
    if trigger_reason == "visual_event" or trigger_reason == "score_change":
        prompt_text = "[VISUAL EVENT] React to what's on screen now."
    elif trigger_reason == "idle_break":
        prompt_text = "[IDLE] Offer a light observation on the current scene."
    
    user_parts.append(types.Part.from_text(text=prompt_text))

    for frame_data_url in frames:
        if not isinstance(frame_data_url, str) or not frame_data_url.startswith("data:image/"):
            continue
        try:
            header, encoded = frame_data_url.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
            img_bytes = base64.b64decode(encoded)
            user_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime_type))
        except Exception as e:
            print(f"Error decoding image: {e}")

    contents.append(types.Content(role="user", parts=user_parts))
    
    # ---------------------------------------------
    # Format contents for Gemini strict role rules:
    # 1. Must start with 'user'
    # 2. Roles must strictly alternate
    # ---------------------------------------------
    cleaned_contents = []
    for c in contents:
        if cleaned_contents and cleaned_contents[-1].role == c.role:
            cleaned_contents[-1].parts.extend(c.parts)
        else:
            cleaned_contents.append(c)
    
    if cleaned_contents and cleaned_contents[0].role == "model":
        cleaned_contents.pop(0)
    
    if not cleaned_contents:
        cleaned_contents.append(types.Content(role="user", parts=[types.Part.from_text(text="Hello.")]))

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=150,
    )

    async def generate_stream():
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=cleaned_contents,
                config=config,
            )
            async for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            err_str = str(e)
            yield f"Connection disrupted! (Vision: {err_str[:80]}...)"

    return StreamingResponse(generate_stream(), media_type="text/plain; charset=utf-8")


@app.get("/api/session-token")
async def get_session_token():
    """Issue a short-lived SpatialReal session token for the browser avatar."""
    api_key = os.getenv("SPATIALREAL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="SPATIALREAL_API_KEY not set")

    expire_at = int(time.time()) + 3600

    def fetch_token():
        import requests as req

        response = req.post(
            "https://console.us-west.spatialwalk.cloud/v1/console/session-tokens",
            headers={"X-Api-Key": api_key, "Content-Type": "application/json"},
            json={"expireAt": expire_at, "modelVersion": ""},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    try:
        data = await asyncio.to_thread(fetch_token)
        return {"sessionToken": data["sessionToken"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SpatialReal token error: {str(e)}")



# OpenAI TTS — keep avatar UUIDs in sync with src/config/avatarVoiceProfiles.ts
_DEFAULT_AVATAR_ID = "2fc89f70-5060-4963-a2d7-4da4cab73c54"
_ALLOWED_TTS_VOICES = frozenset(
    {"alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"}
)

# SpatialReal avatar UUID → base voice + speed + style instructions (used with gpt-4o-mini-tts)
_AVATAR_TTS_PROFILE = {
    _DEFAULT_AVATAR_ID: {
        "voice": "fable",
        "speed": 1.0,
        "instructions": (
            "Speak with refined British Received Pronunciation as a mature, calm male "
            "theatrical narrator—clear articulation, measured pace, no American accent."
        ),
    },
    "ca9c5c22-6dba-4b59-ae3b-d26066f8c017": {
        "voice": "nova",
        "speed": 1.0,
        "instructions": (
            "Speak as a warm adult female assistant: soft, clear, helpful, slightly bright—"
            "never masculine or monotone."
        ),
    },
    "067bf019-4234-479d-9b6a-2021e462bcc2": {
        "voice": "echo",
        "speed": 1.15,
        "instructions": (
            "Speak as an energetic young boy watching sports: playful, excited, higher pitch energy, "
            "short clauses—not a deep adult male announcer."
        ),
    },
}

_VOICE_STYLE_TTS = {
    "british_male": _AVATAR_TTS_PROFILE[_DEFAULT_AVATAR_ID],
    "female_soft": _AVATAR_TTS_PROFILE["ca9c5c22-6dba-4b59-ae3b-d26066f8c017"],
    "child_energetic": _AVATAR_TTS_PROFILE["067bf019-4234-479d-9b6a-2021e462bcc2"],
}

_DEFAULT_PROFILE = {
    "voice": "fable",
    "speed": 1.0,
    "instructions": _AVATAR_TTS_PROFILE[_DEFAULT_AVATAR_ID]["instructions"],
}


def _tts_profile_for_request(avatar_id: str, voice_style: str) -> dict:
    if avatar_id in _AVATAR_TTS_PROFILE:
        return dict(_AVATAR_TTS_PROFILE[avatar_id])
    if voice_style in _VOICE_STYLE_TTS:
        return dict(_VOICE_STYLE_TTS[voice_style])
    return dict(_DEFAULT_PROFILE)


def _truncate_instructions(s: str, max_len: int = 450) -> str:
    s = (s or "").strip()
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


@app.post("/api/tts")
async def fetch_tts(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "")
        if not text:
            return Response(status_code=400)

        raw_aid = data.get("avatarId") or data.get("avatar_id") or _DEFAULT_AVATAR_ID
        avatar_id = str(raw_aid).strip().lower()

        raw_style = data.get("voiceStyle") or data.get("voice_style")
        voice_style = str(raw_style).strip().lower() if raw_style else ""

        profile = _tts_profile_for_request(avatar_id, voice_style)
        voice = profile.get("voice", "fable")
        if voice not in _ALLOWED_TTS_VOICES:
            voice = "fable"
        try:
            spd = float(profile.get("speed", 1.0))
        except (TypeError, ValueError):
            spd = 1.0
        spd = max(0.25, min(4.0, spd))
        instructions = _truncate_instructions(profile.get("instructions", ""))

        tts_model = (os.environ.get("OPENAI_TTS_MODEL") or "gpt-4o-mini-tts").strip()
        use_instructions = "gpt-4o" in tts_model and bool(instructions)

        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

        async def _create(model: str, with_instr: bool):
            kwargs = {"model": model, "voice": voice, "input": text, "speed": spd}
            if with_instr and instructions:
                kwargs["instructions"] = instructions
            return await client.audio.speech.create(**kwargs)

        try:
            response = await _create(tts_model, use_instructions)
        except Exception as first_err:
            if use_instructions:
                log.warning("TTS model %s failed (%s); falling back to tts-1-hd", tts_model, first_err)
                try:
                    response = await _create("tts-1-hd", False)
                except Exception as second_err:
                    log.warning("tts-1-hd failed (%s); falling back to tts-1", second_err)
                    response = await _create("tts-1", False)
            else:
                raise first_err

        log.info(
            "tts ok model=%s avatar=%s voice=%s speed=%s instr=%s",
            tts_model,
            avatar_id,
            voice,
            spd,
            bool(instructions and use_instructions),
        )
        return Response(content=response.content, media_type="audio/mpeg")
    except Exception as e:
        return Response(content=str(e), status_code=500)

@app.post("/api/vision/analyze")
async def analyze_video_vision(file: UploadFile = File(...), persona: str = "analyst"):
    """Uploaded a video clip, analyze with Gemini, return a JSON reaction timeline."""
    try:
        from google import genai
        import json
        
        # 1. Save temp file
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(await file.read())
            
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        
        # 2. Upload to Gemini File API
        print(f"Uploading {temp_path} to Gemini...")
        video_file = client.files.upload(path=temp_path)
        
        # 3. Wait for processing
        while video_file.state.name == "PROCESSING":
            await asyncio.sleep(2)
            video_file = client.files.get(name=video_file.name)
            
        if video_file.state.name == "FAILED":
            raise Exception("Video processing failed on Gemini side")

        # 4. Prompt Design
        base_prompts = {
            "analyst": "You are a professional NBA analyst. Focus on strategy and mechanics.",
            "trash_talker": "You are a sarcastic hater. Roast the players and the plays.",
            "emotional": "You are a screaming superfan. Everything is a highlight!"
        }
        p_prompt = base_prompts.get(persona, base_prompts["analyst"])
        
        prompt = (
            f"{p_prompt}\n"
            "Watch this NBA video clip. Provide a JSON list of specifically timed reactions. "
            "Each reaction should be an object with 'timestamp' (seconds from start, float) and 'comment' (your reaction, 1 sentence). "
            "Return ONLY the JSON array. Output format: "
            "[{\"timestamp\": 1.5, \"comment\": \"reaction\"}, ...]"
        )
        
        # 5. Generate content
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[video_file, prompt]
        )
        
        # Cleanup temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        # Parse JSON from response
        res_text = response.text.replace("```json", "").replace("```", "").strip()
        timeline = json.loads(res_text)
        
        return {"timeline": timeline}
        
    except Exception as e:
        print(f"Vision Error: {e}")
        return {"error": str(e)}


@app.post("/api/vision/motion-frames")
async def extract_motion_frames_endpoint(
    file: UploadFile = File(...),
    motion_threshold: float = 0.75,
    cooldown_seconds: float = 0.2,
    max_frames: int = 25,
):
    """Extract high-motion screenshots with OpenCV.

    This is the backend hook for the left-line OpenCV stage. For now it accepts
    uploaded clips; live YouTube/DVR support needs a backend stream URL or ring
    buffer because browser iframes do not expose frames to OpenCV.
    """
    import tempfile

    suffix = os.path.splitext(file.filename or "upload.mp4")[1] or ".mp4"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            temp_file.write(await file.read())

        frames = extract_motion_frames(
            temp_path,
            pixel_diff_threshold=25,
            motion_threshold=motion_threshold,
            cooldown_seconds=cooldown_seconds,
            jpeg_quality=85,
            max_frames=max_frames,
        )

        return {
            "frames": [
                {
                    "index": frame.index,
                    "frameIndex": frame.frame_index,
                    "timestamp": frame.timestamp,
                    "motionRatio": frame.motion_ratio,
                    "dataUrl": frame.data_url,
                }
                for frame in frames
            ],
            "count": len(frames),
            "config": {
                "motionThreshold": motion_threshold,
                "cooldownSeconds": cooldown_seconds,
                "maxFrames": max_frames,
            },
        }
    except Exception as e:
        print(f"Motion frame extraction error: {e}")
        return Response(content=str(e), status_code=500)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
