# VStandby Studio — product brief

## One-liner

VStandby Studio is an AI digital co-host for people who watch games alone. It is not a post-game stats tool; it watches with you, reacts, banters, and discusses plays in real time.

## Who it is for

Fans who do not have a steady watch party—no one on the couch, no reliable cross-timezone co-watch— but still want someone to share hot takes, emotions, and tactics during NBA, esports, or other live sports.

Typical situations:

- Watching from a dorm, home, or commute and wanting a partner to react with.
- Friends in other time zones, so live voice chat is hard.
- Preferring a calmer experience than a noisy public stream chat, but still wanting a knowledgeable, personalized companion.
- Caring about specific players or teams and wanting commentary aligned to those preferences.

## Perceived “zero delay”

Classic AI co-viewing waits for a clip to upload, analyze, and return speech—by then the moment is gone.

We target **perceived** zero delay, not physical zero:

1. User provides a live URL, or we find a pausable, rewindable source after search.
2. The **model** watches the same stream at the **latest live edge**.
3. The **user** watches the same stream a few seconds behind.
4. Before the user sees a slow-motion replay, the system has already started detection, frames, and line prep.
5. When the user’s video hits that moment, the avatar already has something ready to say—like a person who saw it first.

Reframing: from “AI speaks after it finishes thinking” to “line is ready when the user sees the play”.

## Why frames, not full video

The output model can read text and images, so the slow-mo path uses **commentary / subtitles + 5 fps frames**, not a full video upload per segment.

- Frames can be produced continuously as slow-mo runs—no long encode/upload wait.
- A 3–5s replay might be 15–25 images—smaller payload, tighter latency.
- Multimodal models can read enough from key frames to describe what happened and how to react.
- At segment end, text + image batch can go straight to the LLM for a candidate line.
- For live companionship, speed beats storing full files.

**Conclusion:** the main path uses sampled frames, not full segment recording.

## Stream strategy: same source, two clocks

The strongest story is not “upload a file” but **live**.

We prefer **DVR-capable** live streams: after pause, playback resumes from where you left off, not forced to the latest edge.

That maps cleanly to:

- **Model:** plays the **live edge** (what is happening *now* on the field).
- **User:** plays **live edge minus N seconds** (same broadcast, delayed).
- **N** follows typical end-to-end latency (e.g. 3–8s) so the model can finish prep before the user’s screen shows the highlight.

Entry points: paste a URL, or search for a game and we surface a DVR-friendly stream. If the source is not DVR, we fall back to a **ring buffer** of recent seconds to fake delay.

## Two pipelines

### 1. “Pseudo” zero-latency prep

1. User gives a live link or we match a pausable source.
2. Model consumes the same source at live edge.
3. User sees a delayed playhead on that same source.
4. OpenCV (or similar) flags slow-motion windows on the model’s feed.
5. On slow-mo, sample ~5 images per second.
6. When the slow-mo block ends, send subtitles + image batch to the multimodal LLM.
7. LLM proposes one or more candidate lines.
8. A policy layer decides whether to speak, based on user preferences.

**Key idea:** the model is ahead of the user on the *same* stream, so reactions feel instant.

### 2. Live interaction

1. Hot mic path transcribes the user.
2. Decide whether the user’s moment overlaps the current slow-mo.
3. Decide whether the text matches a **prepared** line.
4. If yes, and a line is ready, send it to the avatar quickly.
5. If not, hand off to a **general** LLM for normal chat.

## Avatar verbosity

Not every play gets a line. A policy uses preferences:

- Chattier vs quieter.
- Favorite players and teams.
- Analytical vs emotional vs trash-talk tone.
- Whether proactive commentary is wanted.

**Chatty users:** the avatar can comment on slow-mo, add tactics, or emotion.

**Quiet users:** only big moments—key slow-mo, controversial calls, score swings. Routine stretches can stay silent.

## When the user talks

1. Fast STT.
2. Check overlap with the current slow-mo window.
3. Check match to a prepared line.

**If in-window and on-topic:** use the pre-generated line → very fast, feels human.

**Otherwise:** general LLM for Q&A or banter.

Fast path = prepped pipeline; long tail = always-on model.

## Architecture (rough layers)

1. **Sources:** user URL, model live edge, delayed user player, mic, data feeds.
2. **Perception:** subtitles, ASR, slow-mo detect, 5 fps frames.
3. **Structure:** summaries, tags, confidence, scoreboard, segment state.
4. **Output LLM:** text + images → candidate speech.
5. **Policy:** when and how to speak.
6. **Avatar:** TTS, face, body, and UI hooks.

## Pitch paragraph

Many viewers are not short on coverage—they are short on **someone to watch with**. VStandby is the AI co-host: it sits through the same live window, and on slow-mo, buckets, calls, and crunch time it reacts like a friend who is caught up. The product bet is **perceived** zero delay: one stream, two offsets, precomputed lines so when your screen finally shows the replay, the avatar is already in sync.

## Phased delivery (suggested)

**Phase 1:** dual playheads (model + delayed user), URL paste, DVR detection, OpenCV slow-mo bounds, 5 fps sampling, multimodal line generation, simple fixed persona.

**Phase 2:** user prefs (verbosity, players, teams, tone), fast STT, on-topic / off-topic routing, fast path to pre-generated lines.

**Phase 3:** memory over sessions, richer avatar motion and voice personalization.
