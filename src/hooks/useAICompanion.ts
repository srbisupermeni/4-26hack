import { useState, useEffect, useRef, useCallback } from 'react';
import { GameContext } from './useGameSimulation';
import { captureFrame, fingerprintDiff, CapturedFrame } from '../lib/frameCapture';
import { useGeminiLive, type GeminiLiveState } from './useGeminiLive';

export type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  content: string;
};

export type PersonaType = 'analyst' | 'trash_talker' | 'emotional';

// Kept for backward-compat with PipelineBuilder UI display
export type PipelineUiState = {
  status: 'idle' | 'capturing' | 'understanding' | 'generating' | 'complete' | 'error';
  error?: string;
  updatedAt?: number;
};

export interface VisionCompanionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}

// Perception loop tuning
const FRAME_SAMPLE_INTERVAL_MS = 800;
const FRAME_BUFFER_SIZE = 5;
const SCENE_CHANGE_THRESHOLD = 0.08;
const VISUAL_EVENT_COOLDOWN_MS = 5_000;
const SCORE_EVENT_COOLDOWN_MS = 5_000;
const IDLE_CHECK_INTERVAL_MS = 3_000;
const IDLE_BREAK_AFTER_MS = 28_000;

export function useAICompanion(
  gameContext: GameContext,
  activeSport?: string,
  vision?: VisionCompanionOptions,
  spatialRealRef?: React.RefObject<{ receiveAudioFromLive: (pcm: ArrayBuffer) => void } | null>,
) {
  const [persona, setPersonaState] = useState<PersonaType>('analyst');
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'intro',
    role: 'ai',
    content: "Hey! Ready to watch the game? Let me know if you want to talk about any of the plays."
  }]);
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [visionTimeline, setVisionTimeline] = useState<{ timestamp: number; comment: string }[]>([]);
  const [isVisionLive, setIsVisionLive] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineUiState>({ status: 'idle' });

  // WebAudio for PCM16 24kHz streaming playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const previousPlayRef = useRef<string>('');
  const lastBroadcastTime = useRef<number>(0);
  const waitingForUserRef = useRef<boolean>(false);
  const lastVisionTimestamp = useRef<number>(-1);
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const inFlightRef = useRef<boolean>(false);
  const pendingAiMsgIdRef = useRef<string | null>(null);

  const visionEnabled = vision?.enabled ?? false;
  const videoRef = vision?.videoRef;

  // ── Gemini Live: ensure AudioContext exists (call inside user gesture) ────
  const ensureAudioContext = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new AudioContext({ sampleRate: 24000 });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    const gain = ctx.createGain();
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    gainRef.current = gain;
    nextStartTimeRef.current = ctx.currentTime;
    return ctx;
  };

  // ── Gemini Live callbacks ─────────────────────────────────────────────────
  const onAudioOutput = useCallback((pcm24k: ArrayBuffer) => {
    if (!isVoiceEnabled) return;
    const ctx = ensureAudioContext();

    const samples = pcm24k.byteLength / 2;
    const buf = ctx.createBuffer(1, samples, 24000);
    const ch = buf.getChannelData(0);
    const view = new DataView(pcm24k);
    for (let i = 0; i < samples; i++) ch[i] = view.getInt16(i * 2, true) / 32768;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainRef.current!);

    const startAt = Math.max(ctx.currentTime + 0.01, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buf.duration;

    setIsSpeaking(true);
    src.onended = () => {
      if (nextStartTimeRef.current <= ctx.currentTime + 0.05) setIsSpeaking(false);
    };

    // Forward to SpatialReal avatar for lip sync
    spatialRealRef?.current?.receiveAudioFromLive(pcm24k);
  }, [isVoiceEnabled, spatialRealRef]);

  const onTranscript = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'ai' && last.id === pendingAiMsgIdRef.current) {
        return [...prev.slice(0, -1), { ...last, content: text }];
      }
      const id = Date.now().toString();
      pendingAiMsgIdRef.current = id;
      return [...prev, { id, role: 'ai', content: text }];
    });
    if (isFinal) {
      setIsTyping(false);
      inFlightRef.current = false;
      pendingAiMsgIdRef.current = null;
      setPipelineState({ status: 'complete', updatedAt: Date.now() });
    }
  }, []);

  const onStateChange = useCallback((s: GeminiLiveState) => {
    setPipelineState({ status: s === 'connected' ? 'idle' : 'understanding', updatedAt: Date.now() });
  }, []);

  const geminiLive = useGeminiLive({ onAudioOutput, onTranscript, onStateChange });

  // ── Build context prompt for auto-broadcasts ──────────────────────────────
  const buildPrompt = (
    reason: 'score_change' | 'visual_event' | 'idle_break' | 'user_message',
    userMessage?: string,
  ) => {
    const score = gameContext.score || '';
    const lastPlay = gameContext.lastPlay || '';
    const sport = activeSport || 'NBA';
    if (reason === 'score_change') return `[GAME] ${sport} update — score: ${score}. Play: ${lastPlay}. React in 1 sentence.`;
    if (reason === 'visual_event') return `[VISUAL] Something happened in the ${sport} game: ${lastPlay}. React in 1 sentence.`;
    if (reason === 'idle_break') return `[IDLE] ${sport} context: ${lastPlay}. Drop a light observation.`;
    return userMessage || 'React to the current game.';
  };

  // ── Connect on mount / persona change ─────────────────────────────────────
  useEffect(() => {
    geminiLive.connect(persona);
    return () => geminiLive.disconnect();
  }, [persona]);

  // ── Real-time perception loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!visionEnabled || !videoRef) {
      frameBufferRef.current = [];
      setIsVisionLive(false);
      return;
    }
    const tick = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || video.readyState < 2) return;
      const frame = captureFrame(video);
      if (!frame) return;
      const buf = frameBufferRef.current;
      const prev = buf.length > 0 ? buf[buf.length - 1] : null;
      buf.push(frame);
      if (buf.length > FRAME_BUFFER_SIZE) buf.shift();
      setIsVisionLive(true);
      if (prev && fingerprintDiff(prev, frame) > SCENE_CHANGE_THRESHOLD) {
        triggerBroadcast('visual_event');
      }
    };
    const id = window.setInterval(tick, FRAME_SAMPLE_INTERVAL_MS);
    return () => { window.clearInterval(id); setIsVisionLive(false); };
  }, [visionEnabled, videoRef]);

  // ── Idle-break loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visionEnabled || !videoRef) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      if (frameBufferRef.current.length === 0 || isTyping || inFlightRef.current || waitingForUserRef.current) return;
      if (Date.now() - lastBroadcastTime.current >= IDLE_BREAK_AFTER_MS) {
        triggerBroadcast('idle_break');
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [visionEnabled, videoRef, isTyping]);

  // ── Core broadcast trigger ─────────────────────────────────────────────────
  const triggerBroadcast = (reason: 'visual_event' | 'score_change' | 'idle_break') => {
    if (inFlightRef.current || isTyping) return;
    if (waitingForUserRef.current && reason !== 'idle_break') return;
    const now = Date.now();
    const cooldown =
      reason === 'visual_event' ? VISUAL_EVENT_COOLDOWN_MS :
      reason === 'score_change' ? SCORE_EVENT_COOLDOWN_MS :
      IDLE_BREAK_AFTER_MS;
    if (now - lastBroadcastTime.current < cooldown) return;
    lastBroadcastTime.current = now;
    inFlightRef.current = true;
    setIsTyping(true);
    setPipelineState({ status: 'understanding', updatedAt: Date.now() });
    geminiLive.sendText(buildPrompt(reason));
    if (reason !== 'idle_break') waitingForUserRef.current = true;
  };

  // ── Auto-broadcast on game play change ────────────────────────────────────
  useEffect(() => {
    if (!gameContext.lastPlay) return;
    const playDesc = gameContext.lastPlay;
    if (playDesc === previousPlayRef.current) return;
    const skipPhrases = ["Establishing WebSocket", "System starting", "Establishing connection", "Connecting to Live"];
    if (skipPhrases.some(p => playDesc.includes(p))) return;
    previousPlayRef.current = playDesc;

    const now = Date.now();
    const cooldown = gameContext.isReplay ? 5000 : 8000;
    if (now - lastBroadcastTime.current < cooldown) return;
    if (waitingForUserRef.current || inFlightRef.current || isTyping) return;

    if (visionEnabled && frameBufferRef.current.length > 0) {
      triggerBroadcast('score_change');
      return;
    }

    lastBroadcastTime.current = now;
    inFlightRef.current = true;
    setIsTyping(true);
    setPipelineState({ status: 'understanding', updatedAt: Date.now() });
    geminiLive.sendText(buildPrompt('score_change'));
    waitingForUserRef.current = true;
  }, [gameContext.lastPlay, gameContext.score, persona, visionEnabled]);

  // ── User-initiated message ─────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    waitingForUserRef.current = false;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }]);
    setIsTyping(true);
    setPipelineState({ status: 'understanding', updatedAt: Date.now() });
    lastBroadcastTime.current = Date.now();
    geminiLive.sendText(text, true);
  };

  // ── Persona switch (reconnects Live session with new system prompt) ─────────
  const setPersona = (p: PersonaType) => {
    setPersonaState(p); // triggers useEffect above which calls connect(p)
  };

  // ── Stop speaking ──────────────────────────────────────────────────────────
  const stopSpeaking = () => {
    nextStartTimeRef.current = audioCtxRef.current?.currentTime ?? 0;
    setIsSpeaking(false);
  };

  // ── Game summary (text-only, REST endpoint) ────────────────────────────────
  const askGameSummary = async (meta: any, timeline: any[]) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `Give me a quick summary of this entire ${meta?.title || 'game'} we just watched!`
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: meta, timeline, persona }),
      });
      if (!res.ok) throw new Error('Summary failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder('utf-8');
      const aiMsgId = (Date.now() + 1).toString();
      setIsTyping(false);
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '' }]);

      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Vision analysis (file upload) ─────────────────────────────────────────
  const analyzeVideo = async (file: File) => {
    setIsTyping(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('persona', persona);
    try {
      const res = await fetch('/api/vision/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.timeline) {
        setVisionTimeline(data.timeline);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'ai',
          content: `I've finished watching the video! I've marked ${data.timeline.length} moments I want to talk about. Play whenever you're ready!`
        }]);
        return data.timeline;
      }
    } catch (e) {
      console.error('Vision analysis failed', e);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Vision timeline sync ───────────────────────────────────────────────────
  const syncVision = (currentTime: number) => {
    if (visionTimeline.length === 0) return;
    const next = visionTimeline.find(
      item => item.timestamp <= currentTime && item.timestamp > lastVisionTimestamp.current
    );
    if (next) {
      lastVisionTimestamp.current = next.timestamp;
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: next.comment }]);
      // Speak via Gemini Live
      geminiLive.sendText(next.comment);
    }
  };

  const loadDemoVisionMemory = async () => {
    try {
      const sport = activeSport || 'NBA';
      const res = await fetch(`/api/vision/demo/${sport.toLowerCase()}`);
      if (!res.ok) throw new Error('Failed to fetch demo script');
      const data = await res.json();
      setVisionTimeline(data.timeline);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: data.message || "I've loaded the vision memory."
      }]);
    } catch (e) {
      console.error(e);
    }
  };

  return {
    messages,
    sendMessage,
    isTyping,
    isVoiceEnabled,
    setIsVoiceEnabled,
    isSpeaking,
    analyser: analyserRef.current,
    persona,
    setPersona,
    askGameSummary,
    stopSpeaking,
    analyzeVideo,
    syncVision,
    loadDemoVisionMemory,
    hasVisionData: visionTimeline.length > 0,
    isVisionLive,
    pipelineState,
    // Expose for mic input
    sendAudioChunk: geminiLive.sendAudioChunk,
    stopMicAudio: geminiLive.stopAudio,
    liveState: geminiLive.state,
  };
}
