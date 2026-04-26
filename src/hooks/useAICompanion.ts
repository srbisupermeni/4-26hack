import { useState, useEffect, useRef } from 'react';
import { GameContext } from './useGameSimulation';
import { captureFrame, fingerprintDiff, CapturedFrame } from '../lib/frameCapture';
import {
  requestPipelineReaction,
  type PipelineInputResult,
  type PipelineStatus,
  type PipelineTriggerReason,
} from '../lib/pipelineClient';

export type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  content: string;
};

export type PersonaType = 'analyst' | 'trash_talker' | 'emotional';

type TriggerReason = PipelineTriggerReason;

export type PipelineUiState = {
  status: PipelineStatus;
  input?: PipelineInputResult;
  outputModel?: string;
  error?: string;
  updatedAt?: number;
};

export interface VisionCompanionOptions {
  /** The <video> element the AI should be "watching". */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Master switch — flip off to fully disable real-time perception. */
  enabled: boolean;
}

// Perception loop tuning ------------------------------------------------------
const FRAME_SAMPLE_INTERVAL_MS = 800; // faster polling (0.8s) for low latency
const FRAME_BUFFER_SIZE = 5; // keep the last N frames in memory
const SCENE_CHANGE_THRESHOLD = 0.08; // more sensitive to visual events
const VISUAL_EVENT_COOLDOWN_MS = 5_000; // react more often
const SCORE_EVENT_COOLDOWN_MS = 5_000;
const IDLE_CHECK_INTERVAL_MS = 3_000;
const IDLE_BREAK_AFTER_MS = 28_000; // silence this long while watching ⇒ say something

export function useAICompanion(
  gameContext: GameContext,
  activeSport?: string,
  vision?: VisionCompanionOptions,
) {
  const [persona, setPersona] = useState<PersonaType>('analyst');
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'intro',
    role: 'ai',
    content: "Hey! Ready to watch the game? Let me know if you want to talk about any of the plays."
  }]);
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [visionTimeline, setVisionTimeline] = useState<{timestamp: number, comment: string}[]>([]);
  const [isVisionLive, setIsVisionLive] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineUiState>({
    status: 'idle',
  });

  const previousPlayRef = useRef<string>('');
  const lastBroadcastTime = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const waitingForUserRef = useRef<boolean>(false);
  const lastVisionTimestamp = useRef<number>(-1);

  // Real-time perception state.
  const frameBufferRef = useRef<CapturedFrame[]>([]);
  const inFlightVisionRef = useRef<boolean>(false);

  const visionEnabled = vision?.enabled ?? false;
  const videoRef = vision?.videoRef;

  const isPlayingRef = useRef(false);
  const audioQueueRef = useRef<string[]>([]);

  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  };

  const playNextInQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    const text = audioQueueRef.current.shift()!;
    
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) {
        isPlayingRef.current = false;
        playNextInQueue();
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      currentAudioRef.current = audio;

      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 64;
      }

      const source = audioContextRef.current.createMediaElementSource(audio);
      source.connect(analyserRef.current!);
      analyserRef.current!.connect(audioContextRef.current.destination);

      setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        currentAudioRef.current = null;
        source.disconnect();
        isPlayingRef.current = false;
        playNextInQueue();
      };

      audio.play();
    } catch (e) {
      console.error('Failed to play TTS:', e);
      isPlayingRef.current = false;
      playNextInQueue();
    }
  };

  const queueVoice = (text: string) => {
    if (!isVoiceEnabled || !text.trim()) return;
    audioQueueRef.current.push(text);
    playNextInQueue();
  };

  // ---------------------------------------------------------------------------
  // Real-time perception loop: sample frames + detect scene changes.
  // ---------------------------------------------------------------------------
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

      if (prev) {
        const diff = fingerprintDiff(prev, frame);
        if (diff > SCENE_CHANGE_THRESHOLD) {
          // Big visual change — candidate "something happened".
          triggerBroadcast('visual_event');
        }
      }
    };

    const id = window.setInterval(tick, FRAME_SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      setIsVisionLive(false);
    };
    // We intentionally depend only on the toggle + ref identity; gameContext
    // changes should NOT tear down the perception loop.
  }, [visionEnabled, videoRef]);

  // ---------------------------------------------------------------------------
  // Idle-break loop: if we've been quiet while a video is playing, say something.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!visionEnabled || !videoRef) return;

    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      if (frameBufferRef.current.length === 0) return;
      if (isTyping || inFlightVisionRef.current) return;
      if (waitingForUserRef.current) return;

      const silentFor = Date.now() - lastBroadcastTime.current;
      if (silentFor >= IDLE_BREAK_AFTER_MS) {
        triggerBroadcast('idle_break');
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [visionEnabled, videoRef, isTyping]);

  const runPipelineReaction = async ({
    reason,
    userMessage,
    frames = [],
    history = messages.slice(-6),
    appendMessage = true,
  }: {
    reason: TriggerReason;
    userMessage?: string;
    frames?: string[];
    history?: ChatMessage[];
    appendMessage?: boolean;
  }) => {
    setPipelineState({
      status: frames.length > 0 ? 'capturing' : 'understanding',
      updatedAt: Date.now(),
    });

    const result = await requestPipelineReaction({
      triggerReason: reason,
      userMessage,
      frames,
      gameContext,
      persona,
      activeSport: activeSport || 'NBA',
      chatHistory: history,
    });

    setPipelineState({
      status: 'generating',
      input: result.input,
      outputModel: result.output.model,
      updatedAt: Date.now(),
    });

    const text = result.output.text.trim();
    if (appendMessage && text) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: text,
      }]);
    }

    setPipelineState({
      status: 'complete',
      input: result.input,
      outputModel: result.output.model,
      updatedAt: Date.now(),
    });

    if (result.output.shouldSpeak && text) {
      queueVoice(text);
    }

    return text;
  };

  // ---------------------------------------------------------------------------
  // Core trigger → pipeline adapter call.
  // ---------------------------------------------------------------------------
  const triggerBroadcast = async (reason: TriggerReason) => {
    if (inFlightVisionRef.current || isTyping) return;
    if (waitingForUserRef.current && reason !== 'user_message') return;

    const now = Date.now();
    const cooldown =
      reason === 'visual_event' ? VISUAL_EVENT_COOLDOWN_MS :
      reason === 'score_change' ? SCORE_EVENT_COOLDOWN_MS :
      reason === 'idle_break'   ? IDLE_BREAK_AFTER_MS :
      0;
    if (cooldown > 0 && now - lastBroadcastTime.current < cooldown) return;

    const framesToSend = frameBufferRef.current.slice(-2).map(f => f.dataUrl);
    if (framesToSend.length === 0) return;

    lastBroadcastTime.current = now;
    inFlightVisionRef.current = true;
    setIsTyping(true);

    try {
      await runPipelineReaction({ reason, frames: framesToSend });
      // Visual/score events put us in "waiting for user" mode so we don't
      // talk over ourselves. Idle breaks don't — they're self-gated.
      if (reason === 'visual_event' || reason === 'score_change') {
        waitingForUserRef.current = true;
      }
    } catch (err) {
      console.warn('vision broadcast skipped:', err);
      setPipelineState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Pipeline broadcast failed',
        updatedAt: Date.now(),
      });
    } finally {
      inFlightVisionRef.current = false;
      setIsTyping(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Auto-broadcast on NBA play change. Routes every path through the pipeline
  // adapter so the input-model and output-model handoff stays consistent.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!gameContext.lastPlay) return;

    const playDesc = gameContext.lastPlay;
    if (playDesc === previousPlayRef.current) return;
    const filterStrings = ["Establishing WebSocket", "System starting", "Establishing connection", "Connecting to Live"];
    if (filterStrings.some(f => playDesc.includes(f))) return;

    previousPlayRef.current = playDesc;

    const now = Date.now();
    const cooldown = gameContext.isReplay ? 5000 : 8000;
    if (now - lastBroadcastTime.current < cooldown) return;
    if (waitingForUserRef.current) return;
    if (inFlightVisionRef.current || isTyping) return;

    // Upgrade to vision broadcast when frames are available.
    if (visionEnabled && frameBufferRef.current.length > 0) {
      triggerBroadcast('score_change');
      return;
    }

    lastBroadcastTime.current = now;
    inFlightVisionRef.current = true;
    setIsTyping(true);

    const runTextBroadcast = async () => {
      try {
        await runPipelineReaction({
          reason: 'score_change',
          frames: [],
        });
        waitingForUserRef.current = true;
      } catch (error) {
        console.error("Auto broadcast skipped:", error);
        setPipelineState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Pipeline broadcast failed',
          updatedAt: Date.now(),
        });
      } finally {
        inFlightVisionRef.current = false;
        setIsTyping(false);
      }
    };

    runTextBroadcast();
  }, [gameContext.lastPlay, gameContext.score, persona, visionEnabled]);

  // ---------------------------------------------------------------------------
  // User-initiated message. Uses the same pipeline adapter with optional frames.
  // ---------------------------------------------------------------------------
  const sendMessage = async (text: string) => {
    waitingForUserRef.current = false;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    const framesToSend = visionEnabled
      ? frameBufferRef.current.slice(-2).map(f => f.dataUrl)
      : [];

    try {
      await runPipelineReaction({
        reason: 'user_message',
        userMessage: text,
        frames: framesToSend,
        history: messages.slice(-6),
      });
      // User-triggered → reset cooldown so the AI doesn't immediately fire another proactive broadcast.
      lastBroadcastTime.current = Date.now();
    } catch (error) {
      console.error(error);
      setPipelineState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Pipeline message failed',
        updatedAt: Date.now(),
      });
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'ai', content: 'Connection issue. I missed that, sorry!' };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const askGameSummary = async (meta: any, timeline: any[]) => {
     const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: `Give me a quick summary of this entire ${meta?.title || 'game'} we just watched!` };
     setMessages(prev => [...prev, userMsg]);
     setIsTyping(true);
     const fallbackTimeout = setTimeout(() => setIsTyping(false), 10000);

     try {
       const res = await fetch("/api/chat/summary", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ game: meta, timeline, persona })
       });
       if (!res.ok) throw new Error("Summary failed");

       const reader = res.body?.getReader();
       if (!reader) throw new Error("No reader");

       const decoder = new TextDecoder("utf-8");
       const aiMsgId = (Date.now() + 1).toString();
       clearTimeout(fallbackTimeout);
       setIsTyping(false);
       setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '' }]);

       let fullText = '';
       let processedLength = 0;
       while (true) {
         const {done, value} = await reader.read();
         if(done) break;
         fullText += decoder.decode(value, {stream: true});
         
         const unprocessed = fullText.slice(processedLength);
         const match = unprocessed.match(/[^.!?]+[.!?]+/g);
         if (match) {
             for (const sentence of match) {
                 queueVoice(sentence.trim());
                 processedLength += sentence.length;
             }
         }
         
         setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
       }
       
       const remainder = fullText.slice(processedLength).trim();
       if (remainder) queueVoice(remainder);
     } catch (e) {
        console.error(e);
     } finally {
        clearTimeout(fallbackTimeout);
        setIsTyping(false);
     }
  };

  const analyzeVideo = async (file: File) => {
    setIsTyping(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('persona', persona);

    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.timeline) {
        setVisionTimeline(data.timeline);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'ai',
          content: `I've finished watching the video! I've marked ${data.timeline.length} moments I want to talk about while we watch. Playwhenever you're ready!`
        }]);
        return data.timeline;
      }
    } catch (e) {
      console.error("Vision analysis failed", e);
    } finally {
      setIsTyping(false);
    }
  };

  const syncVision = (currentTime: number) => {
    if (visionTimeline.length === 0) return;

    const nextComment = visionTimeline.find(item =>
      item.timestamp <= currentTime && item.timestamp > lastVisionTimestamp.current
    );

    if (nextComment) {
      lastVisionTimestamp.current = nextComment.timestamp;
      const aiMsgId = Date.now().toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: nextComment.comment }]);
      queueVoice(nextComment.comment);
    }
  };

  const loadDemoVisionMemory = async () => {
    try {
      const sport = activeSport || 'NBA';
      const res = await fetch(`/api/vision/demo/${sport.toLowerCase()}`);
      if (!res.ok) throw new Error("Failed to fetch demo script");
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
    /** True once the real-time perception loop has seen at least one frame. */
    isVisionLive,
    pipelineState,
  };
}
