import os
import random
import asyncio
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
# from google import genai (Moved to lazy loading inside endpoint)
from openai import AsyncOpenAI
from nba_api.stats.endpoints import scoreboardv2, playbyplayv2, leaguegamefinder
from dotenv import load_dotenv

try:
    import historical_games
except ImportError:
    from . import historical_games

load_dotenv('.env.local')
load_dotenv()

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
        
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        
        async def generate_summary_stream():
            try:
                response = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "system", "content": system_prompt}],
                    stream=True,
                    timeout=10.0
                )
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
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
    game_context = data.get("gameContext", {})
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
        f"Right now, the TV shows: Score {game_context.get('score', '0 - 0')}, Clock {game_context.get('clock', '00:00')}, Last play '{game_context.get('lastPlay', 'System starting...')}'.\n"
        "If the user asks you questions or wants to chit-chat, respond naturally about ANY topic but strictly stay fully locked into your assigned persona. "
        "Do NOT constantly mention the 'System starting...' status if the user is just chatting. "
        "Keep responses very casual, punchy, and short (1 or 2 sentences max)."
    )

    if is_auto:
        system_prompt += f"\n\nYou are auto-reacting immediately to this new play: {game_context.get('lastPlay')}\nKeep it to exactly 1 short sentence staying entirely in your persona! Do NOT greet the user!"

    messages = [{"role": "system", "content": system_prompt}]
    
    # Add history
    for msg in chat_history:
        role = "assistant" if msg.get("role") == "ai" else "user"
        content = msg.get("content", "").strip()
        if content:
            messages.append({"role": role, "content": content})
            
    # Add the current message if not auto broadcast
    if user_message and not is_auto:
        # If chat_history already includes this last user message, we shouldn't append it again
        # The frontend appends the user message to history before calling the API, 
        # so let's check if the last message in history is the same.
        if not chat_history or chat_history[-1].get("content") != user_message:
            messages.append({"role": "user", "content": user_message})

    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    async def generate_stream():
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                stream=True,
                timeout=10.0
            )
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            err_str = str(e)
            yield f"Connection disrupted! (System details: {err_str[:80]}...)"

    return StreamingResponse(generate_stream(), media_type="text/plain; charset=utf-8")

@app.post("/api/chat/vision")
async def chat_vision(request: Request):
    """Vision-aware companion chat.

    Accepts the same payload shape as /api/chat plus a `frames` list of
    JPEG data URLs captured from the user's playing video (last 1~3 frames).

    Supports four trigger modes via `triggerReason`:
      - user_message       → user typed something; respond conversationally.
      - visual_event       → client detected a big scene change; react proactively.
      - score_change       → NBA API score bumped; react to the play.
      - idle_break         → long silence; gentle check-in / light commentary.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    user_message = data.get("userMessage", "") or ""
    chat_history = data.get("chatHistory", []) or []
    game_context = data.get("gameContext", {}) or {}
    persona = data.get("persona", "analyst")
    active_sport = data.get("activeSport", "NBA")
    trigger_reason = data.get("triggerReason", "user_message")
    frames = data.get("frames", []) or []

    # Cap frame count & size server-side too (defense in depth against huge payloads).
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
        f"You are sitting next to the user watching a {active_sport} video together.\n"
        "You can actually SEE the video right now — the user-attached images are recent frames from what you're both watching.\n"
        "Ground your reactions in what's visible in the frames. If the frames contradict the text score/state, trust the frames.\n"
        f"Auxiliary text state from the scoreboard: Score {game_context.get('score', 'unknown')}, "
        f"Clock {game_context.get('clock', 'unknown')}, Last play '{game_context.get('lastPlay', 'n/a')}'.\n"
        "Stay fully locked into your assigned persona. Keep responses punchy and short (1~2 sentences max). "
        "Talk like a friend on the couch, not a broadcaster. No greetings, no preamble."
    )

    # Per-trigger nudge.
    if trigger_reason == "visual_event":
        system_prompt += (
            "\n\nThe picture just changed significantly — react immediately to what you see "
            "in the most recent frame. 1 short sentence only, in pure persona."
        )
    elif trigger_reason == "score_change":
        system_prompt += (
            f"\n\nThe score just changed to {game_context.get('score')}. React to the play "
            f"('{game_context.get('lastPlay')}') in 1 short sentence, pure persona."
        )
    elif trigger_reason == "idle_break":
        system_prompt += (
            "\n\nIt's been quiet for a while. Drop a light observation or question based on "
            "what's on screen — don't force hype if nothing's happening."
        )

    # Build OpenAI multimodal messages.
    messages = [{"role": "system", "content": system_prompt}]

    for msg in chat_history:
        role = "assistant" if msg.get("role") == "ai" else "user"
        content = (msg.get("content") or "").strip()
        if content:
            messages.append({"role": role, "content": content})

    # Final user turn: text + image attachments.
    user_content: list = []
    if trigger_reason == "user_message" and user_message:
        user_content.append({"type": "text", "text": user_message})
    elif trigger_reason == "visual_event":
        user_content.append({"type": "text", "text": "[VISUAL EVENT] React to what's on screen now."})
    elif trigger_reason == "score_change":
        user_content.append({
            "type": "text",
            "text": f"[SCORE EVENT] {game_context.get('lastPlay', '')}",
        })
    elif trigger_reason == "idle_break":
        user_content.append({"type": "text", "text": "[IDLE] Offer a light observation on the current scene."})
    else:
        user_content.append({"type": "text", "text": user_message or "React to the current scene."})

    for frame_data_url in frames:
        if not isinstance(frame_data_url, str):
            continue
        if not frame_data_url.startswith("data:image/"):
            continue
        user_content.append({
            "type": "image_url",
            "image_url": {"url": frame_data_url, "detail": "low"},
        })

    messages.append({"role": "user", "content": user_content})

    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    async def generate_stream():
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                stream=True,
                timeout=15.0,
                max_tokens=120,
            )
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            err_str = str(e)
            yield f"Connection disrupted! (Vision: {err_str[:80]}...)"

    return StreamingResponse(generate_stream(), media_type="text/plain; charset=utf-8")


@app.post("/api/tts")
async def fetch_tts(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "")
        if not text:
            return Response(status_code=400)
            
        client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        response = await client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text
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
